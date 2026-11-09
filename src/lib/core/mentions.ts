import { get } from 'svelte/store';
import { notes, titleOf, type Note } from '../widgets/notes/store';
import { dateSuggestions, formatDate, parseDate, relativeDay } from './dates';
import { projectOf, revealTaskId, tasks, type Task } from './tasks';
import { calendarRequest } from './ui';
import { openWidget } from './workspace';

/**
 * Links and dates inside notes and task text. Typing @ offers tasks (in a
 * note), notes (in a task field), and date words. What gets written is plain,
 * readable text:
 *
 *   [@task: #123]                 a task, by its number
 *   [@note: Trip plan]            a note, by its title
 *   [@date: 2026-11-28]           a date (a reminder)
 *   [@time: 2026-11-28 15:20]     a date and time (a reminder)
 *
 * Previews and task rows show them as chips with live labels: the task's
 * current text and status, the note's title, the formatted date. The older
 * form @[label](kind:id) is still read.
 */

export type MentionKind = 'note' | 'task' | 'date';

const TOKEN = /\[@(task|note|date|time):[ \t]*([^\]\n]*?)[ \t]*\]|@\[([^\]\n]*)\]\((note|task|date):([\w:.-]+)\)/g;

interface Match {
  index: number;
  length: number;
  kind: MentionKind;
  /** What the token says: "#123", a note title or id, or a date value. */
  ref: string;
  /** Legacy tokens point at ids; new ones at numbers and titles. */
  legacy: boolean;
}

function scan(src: string): Match[] {
  const out: Match[] = [];
  for (const m of src.matchAll(TOKEN)) {
    const index = m.index ?? 0;
    if (m[1]) out.push({ index, length: m[0].length, kind: m[1] === 'time' ? 'date' : (m[1] as MentionKind), ref: m[2], legacy: false });
    else out.push({ index, length: m[0].length, kind: m[4] as MentionKind, ref: m[4] === 'date' ? m[5].replace('T', ' ') : m[5], legacy: true });
  }
  return out;
}

export interface Resolved {
  kind: MentionKind;
  /** Task id, note id, or the date value ("2026-11-28" / "2026-11-28 15:20"). Empty when missing. */
  id: string;
  label: string;
  missing: boolean;
  /** Tasks: finished or not. */
  done?: boolean;
}

/**
 * A link's target and its own label, if it has one:
 *   "#3"                -> #3
 *   "#3-Gift for mum"   -> #3, shown as "Gift for mum"
 *   "#3 | Gift for mum" -> the same
 *   "Trip plan | plan"  -> the note "Trip plan", shown as "plan"
 * Notes only take "|", since titles often contain dashes.
 */
export function splitLabel(kind: MentionKind, ref: string): { target: string; label?: string } {
  const pipe = ref.indexOf('|');
  if (pipe >= 0) {
    const label = ref.slice(pipe + 1).trim();
    return { target: ref.slice(0, pipe).trim(), label: label || undefined };
  }
  if (kind === 'task') {
    const m = /^#?(\d+)\s*-\s*(.+)$/.exec(ref.trim());
    if (m) return { target: `#${m[1]}`, label: m[2].trim() };
  }
  return { target: ref.trim() };
}

function findTask(ref: string, legacy: boolean, list: Task[]): Task | undefined {
  if (legacy) return list.find((t) => t.id === ref);
  const no = Number(ref.replace(/^#/, ''));
  return Number.isInteger(no) ? list.find((t) => t.no === no) : undefined;
}

function findNote(ref: string, list: Note[]): Note | undefined {
  const needle = ref.trim().toLowerCase();
  return list.find((n) => n.id === ref) ?? list.find((n) => titleOf(n).toLowerCase() === needle);
}

function resolve(m: Match, noteList: Note[], taskList: Task[]): Resolved {
  if (m.kind === 'date') {
    const ok = !!parseDate(m.ref);
    return { kind: 'date', id: ok ? m.ref : '', label: ok ? formatDate(m.ref) : m.ref, missing: !ok };
  }
  const { target, label } = m.legacy ? { target: m.ref, label: undefined } : splitLabel(m.kind, m.ref);
  if (m.kind === 'note') {
    const n = findNote(target, noteList);
    return n
      ? { kind: 'note', id: n.id, label: label ?? titleOf(n), missing: false }
      : { kind: 'note', id: '', label: label ?? (m.legacy ? 'deleted note' : target), missing: true };
  }
  const t = findTask(target, m.legacy, taskList);
  return t
    ? { kind: 'task', id: t.id, label: label ?? `#${t.no} ${t.text}`, missing: false, done: t.done }
    : { kind: 'task', id: '', label: label ?? (m.legacy ? 'deleted task' : `${target} (deleted)`), missing: true };
}

/**
 * Give every link to the same target (with any label) in `src` a new label,
 * or none. Used by "rename" on a chip: the text changes, the link does not.
 */
export function relabel(src: string, kind: 'task' | 'note', ref: string, label: string): string {
  const { target } = splitLabel(kind, ref);
  const clean = label.replace(/[[\]\n|]/g, ' ').trim();
  return src.replace(TOKEN, (whole, k: string, r: string) => {
    if (k !== kind || splitLabel(kind, r).target.toLowerCase() !== target.toLowerCase()) return whole;
    if (!clean) return `[@${kind}: ${target}]`;
    return kind === 'task' ? `[@task: ${target}-${clean}]` : `[@note: ${target} | ${clean}]`;
  });
}

/** The text to write for a task, a note or a date. */
export function taskToken(t: Task): string {
  return `[@task: #${t.no}]`;
}
export function noteToken(n: Note): string {
  return `[@note: ${titleOf(n).replace(/[[\]\n]/g, ' ').trim()}]`;
}
export function dateToken(value: string): string {
  return value.length > 10 ? `[@time: ${value}]` : `[@date: ${value}]`;
}

/** A run of text, or a link when `kind` is set. */
export interface Segment {
  kind?: MentionKind;
  text: string;
  id: string;
  label: string;
  missing: boolean;
  done?: boolean;
}

/** A link: a segment with a kind. */
export type Link = Segment & { kind: MentionKind };

/**
 * Split text into plain runs and links, with live labels. Pass the stores'
 * values so callers re-render when notes or tasks change.
 */
export function segments(src: string, noteList: Note[] = get(notes), taskList: Task[] = get(tasks)): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of scan(src)) {
    if (m.index > last) out.push({ text: src.slice(last, m.index), id: '', label: '', missing: false });
    out.push({ ...resolve(m, noteList, taskList), text: '' });
    last = m.index + m.length;
  }
  if (last < src.length) out.push({ text: src.slice(last), id: '', label: '', missing: false });
  return out;
}

/** Only the links in a piece of text, with live labels. */
export function linksIn(src: string, noteList: Note[] = get(notes), taskList: Task[] = get(tasks)): Link[] {
  return segments(src, noteList, taskList).filter((s): s is Link => s.kind !== undefined);
}

/** Where each link sits in the text (offsets into `src`), resolved, for editors that draw chips. */
export interface MentionRange extends Resolved {
  from: number;
  to: number;
  ref: string;
  /** Dates with a time: [@time: ...]. */
  time: boolean;
}

export function mentionRanges(src: string, noteList: Note[] = get(notes), taskList: Task[] = get(tasks)): MentionRange[] {
  return scan(src).map((m) => {
    const r = resolve(m, noteList, taskList);
    return { ...r, from: m.index, to: m.index + m.length, ref: m.ref, time: r.kind === 'date' && r.id.length > 10 };
  });
}

/** Every valid date in a piece of text ("2026-11-28" or "2026-11-28 15:20"). */
export function datesIn(src: string): string[] {
  return scan(src)
    .filter((m) => m.kind === 'date' && parseDate(m.ref))
    .map((m) => m.ref);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Replace every link with a chip for the notes preview: tasks get a status
 * circle (filled with a tick when done), dates a relative day ("in 3 days").
 */
export function resolveForHtml(src: string, noteList: Note[] = get(notes), taskList: Task[] = get(tasks)): string {
  let out = '';
  let last = 0;
  for (const m of scan(src)) {
    out += src.slice(last, m.index);
    last = m.index + m.length;
    const r = resolve(m, noteList, taskList);
    const cls = ['mention', r.kind, r.missing ? 'missing' : '', r.done ? 'done' : '', r.kind === 'date' && r.id.length > 10 ? 'time' : ''].filter(Boolean).join(' ');
    const rel = r.kind === 'date' && !r.missing ? `<span class="rel">${esc(relativeDay(r.id))}</span>` : '';
    out += `<span class="${cls}" data-kind="${r.kind}" data-id="${esc(r.id)}" data-ref="${esc(m.ref)}" tabindex="0"><span class="ico"></span><span class="lbl">${esc(r.label)}</span>${rel}</span>`;
  }
  return out + src.slice(last);
}

/**
 * Open what a link points at: the note in the notes widget, the task in the
 * todo widget (switching to its project), or the date in the calendar.
 */
export function openMention(kind: MentionKind | undefined, id: string) {
  if (!kind || !id) return;
  if (kind === 'date') {
    calendarRequest.set(id.slice(0, 10));
    return;
  }
  if (kind === 'note') {
    if (!get(notes).some((n) => n.id === id)) return;
    openWidget('notes', { noteId: id });
    return;
  }
  const t = get(tasks).find((x) => x.id === id);
  if (!t) return;
  openWidget('todo', { project: projectOf(t) });
  revealTaskId.set(id);
}

/**
 * One entry in the @ picker: the text to write, or an action for the field
 * to handle (opening the date picker).
 */
export interface Candidate {
  kind: MentionKind;
  label: string;
  detail: string;
  insert: string;
  action?: 'pick-date' | 'pick-time';
}

/**
 * What the @ picker offers. `target` is what this field links to: 'note' in
 * task fields, 'task' in notes. Date words that match come first; with
 * `actions`, "pick a date" entries too.
 */
export function candidates(target: 'note' | 'task', query: string, opts: { actions?: boolean; limit?: number } = {}): Candidate[] {
  const q = query.trim().toLowerCase();
  const limit = opts.limit ?? 9;
  const dates: Candidate[] = dateSuggestions(q).map(({ word, value }) => ({
    kind: 'date',
    label: word,
    detail: value.length > 10 ? `${formatDate(value)}` : `${formatDate(value)} · ${relativeDay(value)}`,
    insert: dateToken(value),
  }));
  const actions: Candidate[] = [];
  if (opts.actions && q) {
    if ('date'.startsWith(q) || 'pick'.startsWith(q)) actions.push({ kind: 'date', label: 'pick a date…', detail: 'calendar', insert: '', action: 'pick-date' });
    if ('time'.startsWith(q) || 'pick'.startsWith(q)) actions.push({ kind: 'date', label: 'pick date and time…', detail: 'calendar', insert: '', action: 'pick-time' });
  }
  let items: Candidate[];
  if (target === 'note') {
    items = get(notes)
      .filter((n) => !q || titleOf(n).toLowerCase().includes(q))
      .map((n) => ({ kind: 'note' as const, label: titleOf(n), detail: 'note', insert: noteToken(n) }));
  } else {
    items = get(tasks)
      .filter((t) => !q || t.text.toLowerCase().includes(q) || String(t.no) === q.replace(/^#/, ''))
      .sort((a, b) => Number(a.done) - Number(b.done) || b.no - a.no)
      .map((t) => ({ kind: 'task' as const, label: `#${t.no} ${t.text}`, detail: t.done ? 'done' : 'task', insert: taskToken(t) }));
  }
  return [...dates, ...actions, ...items].slice(0, limit);
}

/** The @ being typed just before the caret, if any: where it starts and what follows it. */
export function findMention(value: string, caret: number): { start: number; query: string } | null {
  const m = /(^|\s)@([^\s@[\]()]*)$/.exec(value.slice(0, caret));
  if (!m) return null;
  return { start: caret - m[2].length - 1, query: m[2] };
}

/** Replace the typed @query with the token (or nothing) and, after a token, a space. */
export function applyMention(value: string, start: number, caret: number, token: string): { value: string; caret: number } {
  const insert = token ? `${token} ` : '';
  return { value: value.slice(0, start) + insert + value.slice(caret), caret: start + insert.length };
}
