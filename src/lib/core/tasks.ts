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
  createdAt: number;
  doneAt?: number;
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

export function clearDone() {
  tasks.update((list) => list.filter((t) => !t.done));
}
