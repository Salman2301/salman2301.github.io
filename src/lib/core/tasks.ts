import { derived, get, writable } from 'svelte/store';
import { resolveDateWord } from './dates';
import { persisted } from './storage';

/**
 * Tasks shared by the todo widget and the pomodoro: the pomodoro shows the
 * active task and credits finished focus sessions to it.
 *
 * Tasks belong to a project (a named list, "Inbox" by default). A task can
 * have sub-tasks, one level deep, and both projects and tasks can carry notes.
 */
export interface Task {
  id: string;
  /** Stable number shown as #n, unique across all tasks and projects. */
  no: number;
  text: string;
  done: boolean;
  /** Completed pomodoro focus sessions credited to this task. */
  pomodoros: number;
  /** Focus time spent on this task while it was the pomodoro's active task, in ms. */
  spentMs?: number;
  /** Due date: "YYYY-MM-DD" or "YYYY-MM-DD HH:MM". */
  due?: string;
  /** Project this task belongs to. Missing means the Inbox (tasks made before projects). */
  projectId?: string;
  /** Set on a sub-task: the task it belongs to. */
  parentId?: string;
  /** Free-form notes. */
  notes?: string;
  createdAt: number;
  doneAt?: number;
}

/**
 * A space (called a project in the code and storage): a named group of tasks
 * and notes, with an optional theme of its own.
 */
export interface Project {
  id: string;
  name: string;
  notes: string;
  createdAt: number;
  /** Theme shown while this space is active; unset uses the normal theme. */
  theme?: string;
}

export const INBOX_ID = 'inbox';
const INBOX: Project = { id: INBOX_ID, name: 'Inbox', notes: '', createdAt: 0 };

/** "1h 05m", "12m", "42s", or "0s" */
export function formatSpent(ms: number | undefined): string {
  const total = Math.floor((ms ?? 0) / 1000);
  if (total < 60) return `${total}s`;
  const mins = Math.floor(total / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

/** Whether a due date has passed (a date alone counts as due at the end of that day). */
export function isOverdue(due: string | undefined, now = new Date()): boolean {
  if (!due) return false;
  const [d, t] = due.split(' ');
  const end = t ? new Date(`${d}T${t}:00`) : new Date(`${d}T23:59:59`);
  return end.getTime() < now.getTime();
}

export const tasks = persisted<Task[]>('tasks:list', []);
export const activeTaskId = persisted<string | null>('tasks:active', null);
export const projects = persisted<Project[]>('tasks:projects', [INBOX]);
/** Last number handed out to a task. */
const seq = persisted<number>('tasks:seq', 0);
/** Set to a task id to scroll the todo widget to that task (used by @ links from notes). */
export const revealTaskId = writable<string | null>(null);

/** Give every task a number, oldest first, if it was saved before numbers existed. */
function ensureNumbers() {
  const list = get(tasks);
  if (list.every((t) => typeof t.no === 'number')) return;
  let next = Math.max(get(seq), ...list.map((t) => t.no ?? 0));
  const numbered = new Map<string, number>();
  for (const t of [...list].sort((a, b) => a.createdAt - b.createdAt)) if (typeof t.no !== 'number') numbered.set(t.id, ++next);
  tasks.set(list.map((t) => (numbered.has(t.id) ? { ...t, no: numbered.get(t.id)! } : t)));
  seq.set(next);
}
ensureNumbers();

function nextNo(): number {
  const n = Math.max(get(seq), ...get(tasks).map((t) => t.no ?? 0)) + 1;
  seq.set(n);
  return n;
}

/** The task with this number, if any. */
export function taskByNo(no: number): Task | undefined {
  return get(tasks).find((t) => t.no === no);
}

export const activeTask = derived([tasks, activeTaskId], ([$tasks, $id]) => $tasks.find((t) => t.id === $id && !t.done) ?? null);

/** The project a task belongs to (the Inbox when it has none). */
export function projectOf(task: Task): string {
  return task.projectId ?? INBOX_ID;
}

function newId(prefix = 't') {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Add a task. With `parentId` it becomes a sub-task of that task (and joins its
 * project). Sub-tasks of sub-tasks are not allowed, so that returns null.
 */
/**
 * Pull a reminder date out of task text: a picked date ([@date: 2026-11-10],
 * [@time: 2026-11-10 09:30], or the older @[label](date:...)) or a typed
 * date word (@tmrw, @monday, @2026-12-01). The first one becomes the due date, and all are removed.
 */
export function extractDue(text: string, now = new Date()): { text: string; due?: string } {
  let due: string | undefined;
  const out = text
    .replace(/@\[[^\]\n]*\]\(date:([\w:.-]+)\)/g, (_, v: string) => {
      due ??= v.replace('T', ' ');
      return ' ';
    })
    .replace(/\[@(?:date|time):[ \t]*(\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?)[ \t]*\]/g, (_, v: string) => {
      due ??= v;
      return ' ';
    })
    .replace(/(^|\s)@([a-z][\w-]*|\d{4}-\d{2}-\d{2})(?=\s|$)/gi, (m, pre: string, word: string) => {
      const v = resolveDateWord(word, now);
      if (!v) return m;
      due ??= v;
      return pre;
    })
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { text: out, due };
}

export function addTask(text: string, opts: { projectId?: string; parentId?: string } = {}): Task | null {
  const { text: clean, due } = extractDue(text);
  if (!clean) return null;
  const parent = opts.parentId ? get(tasks).find((t) => t.id === opts.parentId) : undefined;
  if (opts.parentId && (!parent || parent.parentId)) return null;
  const task: Task = {
    id: newId(),
    no: nextNo(),
    text: clean.slice(0, 200),
    done: false,
    pomodoros: 0,
    projectId: parent ? projectOf(parent) : opts.projectId ?? INBOX_ID,
    createdAt: Date.now(),
  };
  if (parent) task.parentId = parent.id;
  if (due) task.due = due;
  tasks.update((list) => [...list, task]);
  return task;
}

export interface PastedLine {
  text: string;
  /** Indented under the line before: becomes its sub-task. */
  nested: boolean;
  done: boolean;
}

/**
 * Lines of pasted text as tasks: list markers ("- ", "* ", "• ", "1. ",
 * "1) ") and checkboxes ("[ ]", "[x]") are dropped, blank lines skipped,
 * and indented lines nest under the line above.
 */
export function parseTaskLines(text: string): PastedLine[] {
  const out: PastedLine[] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (!raw.trim()) continue;
    const indent = /^[ \t]*/.exec(raw)![0].replace(/\t/g, '  ').length;
    let line = raw.trim().replace(/^([-*+•]|\d+[.)])(\s+|$)/, '');
    const box = /^\[([ xX])\]\s*/.exec(line);
    if (box) line = line.slice(box[0].length);
    if (!line.trim()) continue;
    out.push({ text: line, nested: indent >= 2 && out.length > 0, done: !!box && box[1] !== ' ' });
  }
  return out;
}

/**
 * Add one task per pasted line, in a space or under a parent task (then
 * every line is a sub-task). Returns the tasks added.
 */
export function addTaskLines(text: string, opts: { projectId?: string; parentId?: string } = {}): Task[] {
  const added: string[] = [];
  let lastTop: Task | null = null;
  for (const line of parseTaskLines(text)) {
    const parentId = opts.parentId ?? (line.nested && lastTop ? lastTop.id : undefined);
    const t = addTask(line.text, parentId ? { parentId } : { projectId: opts.projectId });
    if (!t) continue;
    if (line.done) toggleTask(t.id);
    if (!parentId) lastTop = t;
    added.push(t.id);
  }
  // as they are now (ticking [x] items replaced the objects)
  const now = get(tasks);
  return added.map((id) => now.find((t) => t.id === id)!).filter(Boolean);
}

export function toggleTask(id: string) {
  tasks.update((list) =>
    list.map((t) => (t.id === id ? { ...t, done: !t.done, doneAt: !t.done ? Date.now() : undefined } : t)),
  );
  if (get(activeTaskId) === id) {
    const t = get(tasks).find((x) => x.id === id);
    if (t?.done) activeTaskId.set(null);
  }
}

/** Remove a task and its sub-tasks. */
export function removeTask(id: string) {
  const gone = new Set([id, ...get(tasks).filter((t) => t.parentId === id).map((t) => t.id)]);
  tasks.update((list) => list.filter((t) => !gone.has(t.id)));
  if (gone.has(get(activeTaskId) ?? '')) activeTaskId.set(null);
}

export function renameTask(id: string, text: string) {
  const { text: clean, due } = extractDue(text);
  if (!clean) return;
  tasks.update((list) => list.map((t) => (t.id === id ? { ...t, text: clean.slice(0, 200), due: due ?? t.due } : t)));
}

export function setTaskNotes(id: string, notes: string) {
  tasks.update((list) => list.map((t) => (t.id === id ? { ...t, notes: notes.slice(0, 5000) || undefined } : t)));
}

export function setActiveTask(id: string | null) {
  activeTaskId.set(id);
}

/** Credit one finished focus session to the active task, if any. */
export function creditPomodoro() {
  const id = get(activeTaskId);
  if (!id) return;
  tasks.update((list) => list.map((t) => (t.id === id ? { ...t, pomodoros: t.pomodoros + 1 } : t)));
}

/** Add focus time (ms) to a task. Called by the pomodoro while a focus session runs. */
export function addSpent(id: string, ms: number) {
  if (ms <= 0) return;
  tasks.update((list) => list.map((t) => (t.id === id ? { ...t, spentMs: (t.spentMs ?? 0) + ms } : t)));
}

export function setDue(id: string, due: string | undefined) {
  tasks.update((list) => list.map((t) => (t.id === id ? { ...t, due: due || undefined } : t)));
}

/** Remove finished tasks. Open sub-tasks of a finished task stay, as top-level tasks. */
export function clearDone() {
  const done = new Set(get(tasks).filter((t) => t.done).map((t) => t.id));
  tasks.update((list) =>
    list
      .filter((t) => !t.done)
      .map((t) => (t.parentId && done.has(t.parentId) ? { ...t, parentId: undefined } : t)),
  );
}

/* ------------------------------------------------------------- projects */

export function addProject(name: string): Project | null {
  const clean = name.trim().slice(0, 40);
  if (!clean) return null;
  const project: Project = { id: newId('p'), name: clean, notes: '', createdAt: Date.now() };
  projects.update((list) => [...list, project]);
  return project;
}

export function renameProject(id: string, name: string) {
  const clean = name.trim().slice(0, 40);
  if (!clean) return;
  projects.update((list) => list.map((p) => (p.id === id ? { ...p, name: clean } : p)));
}

/** Give a space its own theme, or null to use the normal theme. */
export function setProjectTheme(id: string, theme: string | null) {
  projects.update((list) => list.map((p) => (p.id === id ? { ...p, theme: theme || undefined } : p)));
}

export function setProjectNotes(id: string, notes: string) {
  projects.update((list) => list.map((p) => (p.id === id ? { ...p, notes: notes.slice(0, 5000) } : p)));
}

/** Delete a project. Its tasks move to the Inbox. The Inbox cannot be deleted. */
export function removeProject(id: string): boolean {
  if (id === INBOX_ID || !get(projects).some((p) => p.id === id)) return false;
  tasks.update((list) => list.map((t) => (projectOf(t) === id ? { ...t, projectId: INBOX_ID } : t)));
  projects.update((list) => list.filter((p) => p.id !== id));
  return true;
}
