import { parseDate, ymd } from './dates';

/**
 * Repeating tasks. A task with a repeat rule keeps coming back: ticking it
 * moves its due date to the next time instead of finishing it.
 *
 * Typed in a task with @: @daily, @weekly, @weekdays, @monthly, @yearly,
 * @every day, @every 2 weeks, @every monday, @every mon,wed,fri,
 * @every weekend, each optionally followed by a time: @daily 9:00,
 * @every monday 18:30.
 *
 * The rule is stored as its canonical text ("every 2 weeks", "every mon,
 * wed"), which is also what the task shows.
 */

export type Unit = 'day' | 'week' | 'month' | 'year';

export interface RepeatRule {
  every: number;
  unit: Unit;
  /** For weekly rules on set days: the weekdays, 0 = Sunday. */
  days?: number[];
}

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const FULL_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function dayIndex(word: string): number {
  const w = word.toLowerCase();
  const i = DAY_NAMES.indexOf(w.slice(0, 3));
  if (i < 0) return -1;
  // "mon", "monday", "mond" are all fine; "monkey" is not.
  return FULL_DAYS[i].startsWith(w) ? i : -1;
}

const UNIT_WORDS: Record<string, Unit> = {
  day: 'day',
  days: 'day',
  week: 'week',
  weeks: 'week',
  month: 'month',
  months: 'month',
  year: 'year',
  years: 'year',
};

const SHORTHAND: Record<string, RepeatRule> = {
  daily: { every: 1, unit: 'day' },
  weekly: { every: 1, unit: 'week' },
  monthly: { every: 1, unit: 'month' },
  yearly: { every: 1, unit: 'year' },
  annually: { every: 1, unit: 'year' },
  weekdays: { every: 1, unit: 'week', days: [1, 2, 3, 4, 5] },
  weekends: { every: 1, unit: 'week', days: [0, 6] },
};

/**
 * Read a rule: "daily", "every 2 weeks", "every mon,wed", "every weekday".
 * The leading "every" is optional. Null when it is not a rule.
 */
export function parseRepeat(text: string): RepeatRule | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return null;
  if (SHORTHAND[t]) return { ...SHORTHAND[t] };
  const m = /^(?:every )?(.+)$/.exec(t);
  if (!m) return null;
  let rest = m[1];
  if (rest === 'weekday' || rest === 'weekdays') return { ...SHORTHAND.weekdays };
  if (rest === 'weekend' || rest === 'weekends') return { ...SHORTHAND.weekends };
  if (rest === 'other day') return { every: 2, unit: 'day' };
  if (rest === 'other week') return { every: 2, unit: 'week' };
  let every = 1;
  const n = /^(\d{1,3}) (.+)$/.exec(rest);
  if (n) {
    every = Number(n[1]);
    rest = n[2];
    if (every < 1) return null;
  }
  if (UNIT_WORDS[rest]) return { every, unit: UNIT_WORDS[rest] };
  if (n) return null;
  const days = rest.split(/\s*(?:,|\band\b|&|\s)\s*/).filter(Boolean).map(dayIndex);
  if (!days.length || days.some((d) => d < 0)) return null;
  return { every: 1, unit: 'week', days: [...new Set(days)].sort((a, b) => a - b) };
}

/** The canonical text of a rule: "every day", "every 2 weeks", "every weekday", "every mon, wed". */
export function repeatText(rule: RepeatRule): string {
  if (rule.days?.length) {
    const key = rule.days.join(',');
    if (key === '1,2,3,4,5') return 'every weekday';
    if (key === '0,6') return 'every weekend';
    return `every ${rule.days.map((d) => DAY_NAMES[d]).join(', ')}`;
  }
  return rule.every === 1 ? `every ${rule.unit}` : `every ${rule.every} ${rule.unit}s`;
}

/** Short label for a chip: "daily", "weekdays", "mon, wed", "every 2 weeks". */
export function repeatLabel(text: string): string {
  const rule = parseRepeat(text);
  if (!rule) return text;
  if (rule.days?.length) {
    const key = rule.days.join(',');
    if (key === '1,2,3,4,5') return 'weekdays';
    if (key === '0,6') return 'weekends';
    return rule.days.map((d) => DAY_NAMES[d]).join(', ');
  }
  if (rule.every === 1) return { day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly' }[rule.unit];
  return repeatText(rule);
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** The same day of the month `months` later, kept inside short months (Jan 31 -> Feb 28). */
function addMonths(d: Date, months: number, dayOfMonth = d.getDate()): Date {
  const first = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(dayOfMonth, last));
}

/** The first day of the rule strictly after `day`. */
function stepAfter(rule: RepeatRule, day: Date, anchorDay: number): Date {
  if (rule.days?.length) {
    for (let i = 1; i <= 7; i++) {
      const d = addDays(day, i);
      if (rule.days.includes(d.getDay())) return d;
    }
  }
  switch (rule.unit) {
    case 'day':
      return addDays(day, rule.every);
    case 'week':
      return addDays(day, 7 * rule.every);
    case 'month':
      return addMonths(day, rule.every, anchorDay);
    case 'year':
      return addMonths(day, 12 * rule.every, anchorDay);
  }
}

/** The first day the rule falls on, on or after `from` (for a new task). */
export function firstDay(rule: RepeatRule, from: Date): Date {
  const day = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  if (rule.days?.length && !rule.days.includes(day.getDay())) return stepAfter(rule, day, day.getDate());
  return day;
}

/**
 * The next due date after `due` ("YYYY-MM-DD" or with " HH:MM"), never
 * earlier than today: a daily task ticked 3 days late comes back today, not
 * on a day already past. Keeps the time of day.
 */
export function nextDue(rule: RepeatRule, due: string, now = new Date()): string {
  const base = parseDate(due.slice(0, 10)) ?? new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const time = due.length > 10 ? due.slice(10) : '';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const anchor = base.getDate();
  let d = stepAfter(rule, base, anchor);
  for (let guard = 0; d < today && guard < 5000; guard++) d = stepAfter(rule, d, anchor);
  return ymd(d) + time;
}

/** The due dates of a rule from `due` up to `until` ("YYYY-MM-DD"), at most `max` of them. */
export function occurrences(rule: RepeatRule, due: string, until: string, max = 60): string[] {
  const start = parseDate(due.slice(0, 10));
  if (!start) return [];
  const time = due.length > 10 ? due.slice(10) : '';
  const anchor = start.getDate();
  const out: string[] = [];
  for (let d = start; ymd(d) <= until && out.length < max; d = stepAfter(rule, d, anchor)) out.push(ymd(d) + time);
  return out;
}

/** "9:00", "9am", "18:30", "6:30pm" as "HH:MM". Null when it is not a time. */
export function parseTime(text: string): string | null {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(text.trim());
  if (!m || (!m[2] && !m[3])) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ampm = m[3]?.toLowerCase();
  if (ampm) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (ampm === 'pm' ? 12 : 0);
  }
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Words that may follow "@every". */
const RULE_WORD = String.raw`(?:\d{1,3}\s+)?[a-z]+(?:\s*(?:,|&|\band\b)\s*[a-z]+)*`;
/** "@daily", "@every 2 weeks", "@every mon, wed", each with an optional time. */
const REPEAT_RE = new RegExp(
  String.raw`(^|\s)@(every\s+(?:other\s+)?${RULE_WORD}|daily|weekly|weekdays|weekends|monthly|yearly|annually)(?:\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\d{1,2}:\d{2}))?(?=\s|$)`,
  'gi',
);

/**
 * Pull a repeat rule out of task text. Returns the text without it, the
 * rule's canonical text, and the first due date (with the time if one was
 * given). Unchanged text and no rule when there is none.
 */
export function extractRepeat(text: string, now = new Date()): { text: string; repeat?: string; due?: string } {
  let found: { repeat: string; due: string } | undefined;
  const out = text.replace(REPEAT_RE, (m, pre: string, phrase: string, timeText?: string) => {
    if (found) return m;
    // "@every monday 9" is ambiguous; a bare number is not a time, give it back.
    let rule = parseRepeat(phrase);
    let time = timeText ? parseTime(timeText) : null;
    let tail = '';
    if (!rule) {
      // "@every monday and tuesday call mom": try fewer words.
      const words = phrase.split(/\s+/);
      for (let k = words.length - 1; k >= 2 && !rule; k--) {
        rule = parseRepeat(words.slice(0, k).join(' '));
        if (rule) tail = ' ' + words.slice(k).join(' ') + (timeText ? ' ' + timeText : '');
      }
      if (rule) time = null;
    }
    if (!rule) return m;
    if (timeText && !time && !tail) tail = ' ' + timeText;
    found = { repeat: repeatText(rule), due: ymd(firstDay(rule, now)) + (time ? ` ${time}` : '') };
    return pre + tail;
  });
  if (!found) return { text };
  return { text: out.replace(/\s{2,}/g, ' ').trim(), ...found };
}
