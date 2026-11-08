import { derived, get } from 'svelte/store';
import { persisted } from './storage';

/**
 * Tasks shared by the todo widget and the pomodoro: the pomodoro shows the
 * active task and credits finished focus sessions to it.
 */
export interface Task {
  id: string;
  text: string;
  done: boolean;
  /** Completed pomodoro focus sessions credited to this task. */
  pomodoros: number;
  /** Focus time spent on this task while it was the pomodoro's active task, in ms. */
  spentMs?: number;
  /** Due date: "YYYY-MM-DD" or "YYYY-MM-DD HH:MM". */
  due?: string;
  createdAt: number;
  doneAt?: number;
}

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

export const activeTask = derived([tasks, activeTaskId], ([$tasks, $id]) => $tasks.find((t) => t.id === $id && !t.done) ?? null);

function newId() {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function addTask(text: string): Task | null {
  const clean = text.trim();
  if (!clean) return null;
  const task: Task = { id: newId(), text: clean.slice(0, 200), done: false, pomodoros: 0, createdAt: Date.now() };
  tasks.update((list) => [...list, task]);
  return task;
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

export function removeTask(id: string) {
  tasks.update((list) => list.filter((t) => t.id !== id));
  if (get(activeTaskId) === id) activeTaskId.set(null);
}

export function renameTask(id: string, text: string) {
  const clean = text.trim();
  if (!clean) return;
  tasks.update((list) => list.map((t) => (t.id === id ? { ...t, text: clean.slice(0, 200) } : t)));
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

export function clearDone() {
  tasks.update((list) => list.filter((t) => !t.done));
}
