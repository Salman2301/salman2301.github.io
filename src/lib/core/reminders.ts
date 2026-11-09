import { derived, get } from 'svelte/store';
import { notes, noteSpace, titleOf } from '../widgets/notes/store';
import { parseDate, ymd } from './dates';
import { datesIn } from './mentions';
import { notify } from './notify';
import { occurrences, parseRepeat } from './repeat';
import { persisted } from './storage';
import { projectOf, tasks } from './tasks';

/**
 * Reminders are dates attached to something: a task's due date (set with
 * @tmrw, @monday, ... or the due picker) and every date link in a note. The
 * calendar in the status bar shows them, and they raise a toast when due.
 */
export interface Reminder {
  kind: 'task' | 'note';
  /** Task or note id. */
  id: string;
  /** "YYYY-MM-DD" */
  day: string;
  /** "HH:MM", when the reminder has a time. */
  time?: string;
  label: string;
  /** The space the task or note is in. */
  projectId: string;
  done: boolean;
  /** Set on a repeating task: the rule text ("every day"). */
  repeat?: string;
  /**
   * A later time of a repeating task, shown ahead in the calendar. Only the
   * task's real due date raises an alert or shows in the Reminders list.
   */
  upcoming?: boolean;
}

/** How far ahead the calendar shows the later times of repeating tasks. */
const REPEAT_AHEAD_DAYS = 400;

export const reminders = derived([tasks, notes], ([$tasks, $notes]) => {
  const out: Reminder[] = [];
  for (const t of $tasks) {
    if (!t.due) continue;
    const base = { kind: 'task' as const, id: t.id, label: `#${t.no} ${t.text}`, projectId: projectOf(t), done: t.done, repeat: t.repeat };
    out.push({ ...base, day: t.due.slice(0, 10), time: t.due.slice(11) || undefined });
    const rule = t.repeat && !t.done ? parseRepeat(t.repeat) : null;
    if (!rule) continue;
    const today = new Date();
    const until = ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + REPEAT_AHEAD_DAYS));
    const max = rule.unit === 'day' && !rule.days ? 120 : 160;
    for (const d of occurrences(rule, t.due, until, max).slice(1)) {
      out.push({ ...base, day: d.slice(0, 10), time: d.slice(11) || undefined, upcoming: true });
    }
  }
  for (const n of $notes) {
    for (const d of new Set(datesIn(n.body))) {
      out.push({ kind: 'note', id: n.id, day: d.slice(0, 10), time: d.slice(11) || undefined, label: titleOf(n), projectId: noteSpace(n), done: false });
    }
  }
  return out.sort((a, b) => (a.day + (a.time ?? '')).localeCompare(b.day + (b.time ?? '')));
});

/** Which space the status-bar calendar shows when no space is active: 'all' or a space id. */
export const calendarList = persisted<string>('calendar:list', 'all');

/** Reminders in one space ('all' for every space): its tasks and its notes. */
export function inList(list: Reminder[], filter: string): Reminder[] {
  return filter === 'all' ? list : list.filter((r) => r.projectId === filter);
}

/* ------------------------------------------------------------- alerts */

/** Reminders already announced, as "kind:id@date", so each one fires once. */
const fired = persisted<string[]>('reminders:fired', []);
/** A date without a time is announced at this hour on the day. */
const DAY_HOUR = 9;
/** Reminders older than this when the page opens are not announced late. */
const GRACE_MS = 12 * 60 * 60 * 1000;

function fireTime(r: Reminder): number {
  const d = parseDate(r.time ? `${r.day} ${r.time}` : r.day);
  if (!d) return Infinity;
  if (!r.time) d.setHours(DAY_HOUR, 0, 0, 0);
  return d.getTime();
}

function check() {
  const now = Date.now();
  const seen = new Set(get(fired));
  const due = get(reminders).filter((r) => {
    if (r.done || r.upcoming) return false;
    const at = fireTime(r);
    return at <= now && now - at < GRACE_MS && !seen.has(`${r.kind}:${r.id}@${r.day}${r.time ?? ''}`);
  });
  if (!due.length) return;
  for (const r of due) {
    seen.add(`${r.kind}:${r.id}@${r.day}${r.time ?? ''}`);
    notify(`Reminder: ${r.label}`, { body: r.time ? `due ${r.time}` : 'due today', sound: true, system: true, durationMs: 10_000 });
  }
  fired.set([...seen].slice(-300));
}

let timer: ReturnType<typeof setInterval> | undefined;

/** Start checking for due reminders. Safe to call more than once. */
export function startReminders() {
  if (timer) return;
  setTimeout(check, 2000);
  timer = setInterval(check, 30_000);
}
