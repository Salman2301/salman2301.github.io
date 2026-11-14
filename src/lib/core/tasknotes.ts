import { get } from 'svelte/store';
import { createNote, notes, setArchived, updateNote, type Note } from '../widgets/notes/store';
import { clearDone, projectOf, removeTask, tasks, type Task } from './tasks';

/**
 * A task's notes live in a note of their own, in the notes app and in the
 * task's space, so they show up with every other note. The note starts with
 * the task's title and a link back to it:
 *
 *   # Revisit Base The Gym
 *
 *   [@task: #40]
 *
 *   what was written for the task
 *
 * The task keeps the note's id. Clearing or deleting the task archives its note.
 */

/** The task's note, if it has one that still exists. */
export function noteOfTask(t: Task, list: Note[] = get(notes)): Note | undefined {
  return t.noteId ? list.find((n) => n.id === t.noteId) : undefined;
}

const head = (t: Task) => `# ${t.text}\n\n[@task: #${t.no}]\n\n`;

/** The note's text without its title and the link to the task. */
export function taskNoteText(note: Note | undefined): string {
  if (!note) return '';
  return note.body.replace(/^#[^\n]*\n+/, '').replace(/^\[@task:[^\]\n]*\]\n*/, '').replace(/\s+$/, '');
}

/** The task's note, made (and linked) if it has none. Old inline notes move into it. */
export function ensureTaskNote(taskId: string): Note | undefined {
  const t = get(tasks).find((x) => x.id === taskId);
  if (!t) return undefined;
  const have = noteOfTask(t);
  if (have) {
    if (have.archived && !t.done) setArchived(have.id, false);
    return have;
  }
  const n = createNote(head(t) + (t.notes ?? ''), projectOf(t));
  tasks.update((list) => list.map((x) => (x.id === taskId ? { ...x, noteId: n.id, notes: undefined } : x)));
  if (t.done) setArchived(n.id, true);
  return get(notes).find((x) => x.id === n.id);
}

/** Write a task's notes (into its note, made if needed). An empty text keeps the note, empty. */
export function setTaskNote(taskId: string, text: string, append = false) {
  const n = ensureTaskNote(taskId);
  const t = get(tasks).find((x) => x.id === taskId);
  if (!n || !t) return;
  const old = taskNoteText(n);
  const body = append && old ? `${old}\n${text}` : text;
  const top = n.body.match(/^#[^\n]*\n+(\[@task:[^\]\n]*\]\n*)?/)?.[0] ?? head(t);
  updateNote(n.id, `${top.replace(/\n*$/, '\n\n')}${body.slice(0, 20000)}`);
}

/** Move every task's old inline notes into notes of their own. */
export function moveInlineNotes() {
  for (const t of get(tasks)) if (t.notes?.trim() && !noteOfTask(t)) ensureTaskNote(t.id);
}

function archiveNotesOf(gone: Task[]) {
  const list = get(notes);
  for (const t of gone) {
    const n = noteOfTask(t, list);
    if (n && !n.archived) setArchived(n.id, true);
  }
}

/** Clear finished tasks (in one space, or all) and archive their notes. Returns the tasks cleared. */
export function clearDoneTasks(projectId?: string): Task[] {
  const done = get(tasks).filter((t) => t.done && (!projectId || projectOf(t) === projectId));
  if (!done.length) return [];
  if (projectId) {
    const ids = new Set(done.map((t) => t.id));
    tasks.update((list) => list.filter((t) => !ids.has(t.id)).map((t) => (t.parentId && ids.has(t.parentId) ? { ...t, parentId: undefined } : t)));
  } else clearDone();
  archiveNotesOf(done);
  return done;
}

/** Delete a task and its sub-tasks, archiving their notes. */
export function deleteTask(id: string) {
  const gone = get(tasks).filter((t) => t.id === id || t.parentId === id);
  removeTask(id);
  archiveNotesOf(gone);
}
