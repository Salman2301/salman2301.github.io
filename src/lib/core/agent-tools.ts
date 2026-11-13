import { get } from 'svelte/store';
import { createNote, deleteNote, moveNote, noteSpace, notes, sortNotes, titleOf, togglePin, updateNote, type Note } from '../widgets/notes/store';
import { snapshot } from './backup';
import { resolveDateWord, ymd } from './dates';
import { reminders } from './reminders';
import { load } from './storage';
import {
  activeTaskId,
  addProject,
  addTask,
  INBOX_ID,
  moveTask,
  projectOf,
  projects,
  removeProject,
  removeTask,
  renameProject,
  renameTask,
  setActiveTask,
  setDue,
  setRepeat,
  setTaskNotes,
  taskByNo,
  tasks,
  toggleTask,
  type Project,
  type Task,
} from './tasks';

/**
 * The tools an AI agent gets for what this site stores: tasks, notes, spaces
 * and reminders. They only touch the stores, never the page, so the same
 * list serves two places:
 *
 *   - the browser, as WebMCP tools (webmcp.ts adds the tools that drive the page)
 *   - the local MCP server in /mcp, which runs them on the sync folder's file
 */

export type Args = Record<string, unknown>;

export interface WebTool {
  name: string;
  title: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
  annotations?: { readOnlyHint?: boolean; consequentialHint?: boolean; untrustedContentHint?: boolean };
  execute(args: Args): unknown | Promise<unknown>;
}

/**
 * Things an agent removed, so `undo_delete` can put them back. Kept in memory
 * for this visit: a reload empties it.
 */
const trash: { what: string; restore: () => void }[] = [];
function binned(what: string, restore: () => void) {
  trash.push({ what, restore });
  if (trash.length > 30) trash.shift();
}

/**
 * The parts that differ between the browser and the local server. webmcp.ts
 * swaps in the page's own search, space delete and live state.
 */
export const hooks = {
  /** Extra fields for get_overview (the timer, music and panes in the browser). */
  overview: (): Record<string, unknown> => ({}),
  search: (query: string): unknown[] => plainSearch(query),
  /** Delete a space, moving its tasks and notes to the Inbox. False when it cannot be deleted. */
  deleteSpace: (id: string): boolean => {
    if (!removeProject(id)) return false;
    notes.update((list) => list.map((n) => (n.spaceId === id ? { ...n, spaceId: undefined } : n)));
    return true;
  },
};

export function spaceName(list: Project[], id: string): string {
  return list.find((p) => p.id === id)?.name ?? 'Inbox';
}

/** Tasks and notes holding every word of the query, best first. */
function plainSearch(query: string): unknown[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const score = (title: string, rest: string) => {
    const t = title.toLowerCase();
    const all = `${t}\n${rest.toLowerCase()}`;
    if (!words.every((w) => all.includes(w))) return 0;
    return 1 + words.filter((w) => t.includes(w)).length * 2 + (t.startsWith(words[0]) ? 2 : 0);
  };
  const spaces = get(projects);
  const out: { score: number; hit: unknown }[] = [];
  for (const t of get(tasks)) {
    const s = score(`${t.text} #${t.no}`, t.notes ?? '');
    if (s) out.push({ score: s - (t.done ? 1.5 : 0), hit: { kind: 'task', title: `#${t.no} ${t.text}`, meta: t.done ? 'done' : t.due ?? spaceName(spaces, projectOf(t)) } });
  }
  for (const n of get(notes)) {
    const s = score(titleOf(n), n.body);
    if (!s) continue;
    const line = n.body.split('\n').find((l, i) => i > 0 && words.some((w) => l.toLowerCase().includes(w)));
    out.push({ score: s, hit: { kind: 'note', title: titleOf(n), ...(line ? { detail: line.trim().slice(0, 120) } : {}), meta: spaceName(spaces, noteSpace(n)), id: n.id } });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 25).map((x) => x.hit);
}

/** The last n days as "YYYY-MM-DD" with what was recorded for each, oldest first. */
function lastDays<T extends { total: number }>(days: Record<string, T>, n: number): { key: string; day: { total: number } }[] {
  const today = new Date();
  return Array.from({ length: n }, (_, i) => {
    const key = ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - (n - 1 - i)));
    return { key, day: days[key] ?? { total: 0 } };
  });
}

/* ---------------------------------------------------------------- helpers */

export const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

export function fail(message: string): never {
  throw new Error(message);
}

/** A space by name or id. Empty means "not given". */
export function spaceId(value: unknown): string | undefined {
  const q = str(value).toLowerCase();
  if (!q) return undefined;
  const list = get(projects);
  const hit = list.find((p) => p.id.toLowerCase() === q) ?? list.find((p) => p.name.toLowerCase() === q);
  if (!hit) fail(`no space called "${str(value)}". Spaces: ${list.map((p) => p.name).join(', ')}`);
  return hit.id;
}

/** A task by its number (12 or "#12") or id. */
export function findTask(value: unknown): Task {
  const q = str(value).replace(/^#/, '');
  if (!q) fail('give the task number, for example 12');
  const t = /^\d+$/.test(q) ? taskByNo(Number(q)) : get(tasks).find((x) => x.id === q);
  if (!t) fail(`no task ${/^\d+$/.test(q) ? '#' : ''}${q}. Use list_tasks to see the numbers.`);
  return t;
}

/** A note by id, exact title, or the start of a title. */
export function findNoteBy(value: unknown): Note {
  const q = str(value);
  if (!q) fail('give the note id or title');
  const list = get(notes);
  const low = q.toLowerCase();
  const n =
    list.find((x) => x.id === q) ??
    list.find((x) => titleOf(x).toLowerCase() === low) ??
    list.find((x) => titleOf(x).toLowerCase().startsWith(low)) ??
    list.find((x) => titleOf(x).toLowerCase().includes(low));
  if (!n) fail(`no note matching "${q}". Use list_notes to see them.`);
  return n;
}

/** "2026-12-01", "2026-12-01 09:30", "2026-12-01T09:30", or a word: today, tmrw, monday. */
function dueValue(value: unknown): string {
  const q = str(value).replace(/^@/, '');
  const m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(q);
  if (m) return m[2] ? `${m[1]} ${m[2].padStart(2, '0')}:${m[3]}` : m[1];
  const d = resolveDateWord(q);
  if (!d) fail(`cannot read the date "${q}". Use YYYY-MM-DD, YYYY-MM-DD HH:MM, or a word like today, tomorrow, monday.`);
  return d;
}

export function taskOut(t: Task) {
  const list = get(tasks);
  const parent = t.parentId ? list.find((x) => x.id === t.parentId) : undefined;
  const out: Record<string, unknown> = { number: t.no, text: t.text, done: t.done, space: spaceName(get(projects), projectOf(t)) };
  if (t.due) out.due = t.due;
  if (t.repeat) out.repeat = t.repeat;
  if (t.notes) out.notes = t.notes;
  if (parent) out.subtaskOf = parent.no;
  const subs = list.filter((x) => x.parentId === t.id);
  if (subs.length) out.subtasks = subs.map((s) => ({ number: s.no, text: s.text, done: s.done }));
  if (t.pomodoros) out.pomodoros = t.pomodoros;
  if (t.spentMs) out.focusMinutes = Math.round(t.spentMs / 60000);
  if (get(activeTaskId) === t.id) out.focused = true;
  return out;
}

function noteOut(n: Note, withBody = false) {
  const out: Record<string, unknown> = {
    id: n.id,
    title: titleOf(n),
    space: spaceName(get(projects), noteSpace(n)),
    updated: new Date(n.updatedAt).toISOString(),
    length: n.body.length,
  };
  if (n.pinned) out.pinned = true;
  if (withBody) out.body = n.body;
  return out;
}
/* ------------------------------------------------------------------ tools */

export const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object' as const, properties, required, additionalProperties: false });
export const S = (description: string, extra: Record<string, unknown> = {}) => ({ type: 'string', description, ...extra });
export const TASK_REF = { type: ['integer', 'string'], description: 'The task number shown as #n, for example 12.' };
const DUE = S('Due date or reminder: YYYY-MM-DD, YYYY-MM-DD HH:MM, or a word such as today, tomorrow, monday, nextweek.');
const REPEAT = S('Repeat rule: daily, weekdays, weekly, monthly, yearly, or "every mon, thu", "every 2 weeks".');
const SPACE = S('Space name (a named group of tasks and notes), for example Inbox.');
export const DATA_TOOLS: WebTool[] = [
  {
    name: 'get_overview',
    title: 'Overview of today',
    description:
      'Start here. One call that says what the user has on: the date and time, overdue tasks, what is due today and in the next 7 days, how many tasks have no date, dates written in notes, and the spaces. In the browser it also has the pomodoro timer, the music playing and the open panes.',
    inputSchema: obj({}),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: () => {
      const now = new Date();
      const today = ymd(now);
      const week = ymd(new Date(now.getTime() + 7 * 864e5));
      const open = get(tasks).filter((t) => !t.done);
      const brief = (t: Task) => ({ number: t.no, text: t.text, due: t.due, space: spaceName(get(projects), projectOf(t)), ...(t.repeat ? { repeat: t.repeat } : {}) });
      const byDue = (a: Task, b: Task) => (a.due ?? '').localeCompare(b.due ?? '');
      return {
        now: { date: today, time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, weekday: now.toLocaleDateString('en-US', { weekday: 'long' }) },
        tasks: {
          open: open.length,
          doneToday: get(tasks).filter((t) => t.doneAt && ymd(new Date(t.doneAt)) === today).length,
          overdue: open.filter((t) => t.due && t.due.slice(0, 10) < today).sort(byDue).slice(0, 25).map(brief),
          dueToday: open.filter((t) => t.due?.slice(0, 10) === today).sort(byDue).map(brief),
          next7Days: open.filter((t) => t.due && t.due.slice(0, 10) > today && t.due.slice(0, 10) <= week).sort(byDue).slice(0, 25).map(brief),
          noDate: open.filter((t) => !t.due).length,
        },
        noteDates: get(reminders)
          .filter((r) => r.kind === 'note' && r.day >= today && r.day <= week)
          .slice(0, 15)
          .map((r) => ({ day: r.day, ...(r.time ? { time: r.time } : {}), note: r.label })),
        spaces: get(projects).map((p) => ({ name: p.name, openTasks: open.filter((t) => projectOf(t) === p.id).length, notes: get(notes).filter((n) => noteSpace(n) === p.id).length })),
        ...hooks.overview(),
      };
    },
  },
  {
    name: 'list_tasks',
    title: 'List tasks',
    description: 'List the tasks in the task app, with their numbers, due dates, spaces and sub-tasks. Open tasks only unless status says otherwise.',
    inputSchema: obj({
      status: S('Which tasks to list.', { enum: ['open', 'done', 'all'], default: 'open' }),
      space: SPACE,
      query: S('Only tasks whose text or notes contain this.'),
      due: S('Only tasks due in this window.', { enum: ['overdue', 'today', 'week'] }),
    }),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (a) => {
      const status = str(a.status) || 'open';
      const space = spaceId(a.space);
      const q = str(a.query).toLowerCase();
      const due = str(a.due);
      const today = ymd(new Date());
      const week = ymd(new Date(Date.now() + 7 * 864e5));
      const all = get(tasks);
      const list = all.filter((t) => {
        if (status === 'open' && t.done) return false;
        if (status === 'done' && !t.done) return false;
        if (space && projectOf(t) !== space) return false;
        if (q && !`${t.text}\n${t.notes ?? ''}`.toLowerCase().includes(q)) return false;
        if (due) {
          const d = t.due?.slice(0, 10);
          if (!d) return false;
          if (due === 'overdue' && !(d < today && !t.done)) return false;
          if (due === 'today' && d !== today) return false;
          if (due === 'week' && !(d >= today && d <= week)) return false;
        }
        return true;
      });
      // sub-tasks are listed inside their parent when the parent is in the list
      const shown = new Set(list.map((t) => t.id));
      const top = list.filter((t) => !t.parentId || !shown.has(t.parentId));
      return { count: list.length, tasks: top.map(taskOut) };
    },
  },
  {
    name: 'add_task',
    title: 'Add a task',
    description: 'Add a task. It goes to the Inbox unless a space is given. With subtaskOf it becomes a sub-task of that task.',
    inputSchema: obj(
      {
        text: S('What to do. At most 200 characters.'),
        space: SPACE,
        due: DUE,
        repeat: REPEAT,
        notes: S('Free-form notes kept with the task.'),
        subtaskOf: { type: ['integer', 'string'], description: 'Number of the parent task. Sub-tasks cannot have sub-tasks.' },
      },
      ['text'],
    ),
    execute: (a) => {
      const text = str(a.text);
      if (!text) fail('text is required');
      const due = str(a.due) ? dueValue(a.due) : undefined;
      const parent = str(a.subtaskOf) ? findTask(a.subtaskOf) : undefined;
      if (parent?.parentId) fail(`#${parent.no} is itself a sub-task, and sub-tasks cannot have sub-tasks`);
      const t = addTask(text, { projectId: spaceId(a.space), parentId: parent?.id });
      if (!t) fail('the task text was empty after removing its date words');
      if (due) setDue(t.id, due);
      if (str(a.repeat) && !setRepeat(t.id, str(a.repeat))) fail(`added #${t.no}, but cannot read the repeat rule "${str(a.repeat)}"`);
      if (str(a.notes)) setTaskNotes(t.id, str(a.notes));
      return { added: taskOut(taskByNo(t.no) ?? t) };
    },
  },
  {
    name: 'update_task',
    title: 'Change a task',
    description: 'Change a task: its text, due date, repeat rule, notes or space. Only the fields given are changed. Pass an empty string for due or repeat to clear it.',
    inputSchema: obj(
      {
        task: TASK_REF,
        text: S('New text.'),
        due: DUE,
        repeat: REPEAT,
        notes: S('Notes for the task.'),
        notesMode: S('replace swaps the old notes, append adds to their end.', { enum: ['replace', 'append'], default: 'replace' }),
        space: SPACE,
      },
      ['task'],
    ),
    execute: (a) => {
      const t = findTask(a.task);
      const space = spaceId(a.space);
      const due = typeof a.due === 'string' && a.due.trim() ? dueValue(a.due) : undefined;
      if (str(a.text)) renameTask(t.id, str(a.text));
      if (a.due !== undefined) setDue(t.id, due);
      if (a.repeat !== undefined && !setRepeat(t.id, str(a.repeat) || null)) fail(`cannot read the repeat rule "${str(a.repeat)}"`);
      if (a.notes !== undefined) {
        const text = typeof a.notes === 'string' ? a.notes : '';
        setTaskNotes(t.id, str(a.notesMode) === 'append' && t.notes ? `${t.notes.replace(/\s+$/, '')}\n${text}` : text);
      }
      if (space) moveTask(t.id, space);
      return { updated: taskOut(findTask(t.no)) };
    },
  },
  {
    name: 'complete_task',
    title: 'Tick a task off',
    description: 'Mark a task done, or open again with done: false. Ticking a repeating task moves it to its next date instead of finishing it.',
    inputSchema: obj({ task: TASK_REF, done: { type: 'boolean', description: 'false re-opens the task.', default: true } }, ['task']),
    execute: (a) => {
      const t = findTask(a.task);
      const want = a.done !== false;
      if (t.repeat && want) toggleTask(t.id);
      else if (t.done !== want) toggleTask(t.id);
      return { task: taskOut(findTask(t.no)) };
    },
  },
  {
    name: 'delete_task',
    title: 'Delete a task',
    description: 'Delete a task and its sub-tasks. Only do it when the user asked for it. undo_delete puts it back until the page is reloaded.',
    inputSchema: obj({ task: TASK_REF }, ['task']),
    annotations: { consequentialHint: true },
    execute: (a) => {
      const t = findTask(a.task);
      const gone = get(tasks).filter((x) => x.id === t.id || x.parentId === t.id);
      removeTask(t.id);
      binned(`task #${t.no} "${t.text}"`, () => tasks.update((list) => [...list, ...gone.filter((g) => !list.some((x) => x.id === g.id))]));
      return { deleted: { number: t.no, text: t.text, subtasksDeleted: gone.length - 1 }, undo: 'undo_delete puts it back' };
    },
  },
  {
    name: 'focus_task',
    title: 'Focus on a task',
    description: 'Set the task the pomodoro timer credits its focus time to. Without a task, clears the focus.',
    inputSchema: obj({ task: TASK_REF }),
    execute: (a) => {
      if (!str(a.task)) {
        setActiveTask(null);
        return { focused: null };
      }
      const t = findTask(a.task);
      if (t.done) fail(`#${t.no} is done`);
      setActiveTask(t.id);
      return { focused: taskOut(t) };
    },
  },
  {
    name: 'list_spaces',
    title: 'List spaces',
    description: 'List the spaces (named groups of tasks and notes) with how many open tasks and notes each holds.',
    inputSchema: obj({}),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: () => ({
      spaces: get(projects).map((p) => ({
        name: p.name,
        openTasks: get(tasks).filter((t) => !t.done && projectOf(t) === p.id).length,
        notes: get(notes).filter((n) => noteSpace(n) === p.id).length,
      })),
    }),
  },
  {
    name: 'add_space',
    title: 'Add a space',
    description: 'Create a new space to group tasks and notes.',
    inputSchema: obj({ name: S('Name of the space.') }, ['name']),
    execute: (a) => {
      const p = addProject(str(a.name));
      if (!p) fail('that name is empty or already used');
      return { added: p.name };
    },
  },
  {
    name: 'list_notes',
    title: 'List notes',
    description: 'List the markdown notes: id, title, space and when each last changed. Use read_note for the text.',
    inputSchema: obj({ space: SPACE, query: S('Only notes whose text contains this.') }),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (a) => {
      const space = spaceId(a.space);
      const q = str(a.query).toLowerCase();
      const list = sortNotes(get(notes)).filter((n) => (!space || noteSpace(n) === space) && (!q || n.body.toLowerCase().includes(q)));
      return { count: list.length, notes: list.map((n) => noteOut(n)) };
    },
  },
  {
    name: 'read_note',
    title: 'Read a note',
    description: 'Get the full markdown text of one note, by id or title.',
    inputSchema: obj({ note: S('Note id or title.') }, ['note']),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (a) => noteOut(findNoteBy(a.note), true),
  },
  {
    name: 'create_note',
    title: 'Write a new note',
    description: 'Create a markdown note. Its first line is its title, so start the body with "# Title".',
    inputSchema: obj({ body: S('The note in markdown.'), space: SPACE }, ['body']),
    execute: (a) => {
      const body = typeof a.body === 'string' ? a.body : '';
      if (!body.trim()) fail('body is required');
      return { created: noteOut(createNote(body, spaceId(a.space))) };
    },
  },
  {
    name: 'update_note',
    title: 'Change a note',
    description:
      'Change a note. body with mode "replace" swaps the whole text, "append" adds to the end, "prepend" adds right under the title. space moves it to another space, pinned pins or unpins it. For a small change inside a long note, use edit_note instead.',
    inputSchema: obj(
      {
        note: S('Note id or title.'),
        body: S('Markdown text.'),
        mode: S('How body is applied.', { enum: ['replace', 'append', 'prepend'], default: 'replace' }),
        space: SPACE,
        pinned: { type: 'boolean', description: 'Pin the note to the top of the list, or unpin it.' },
      },
      ['note'],
    ),
    execute: (a) => {
      const n = findNoteBy(a.note);
      const space = spaceId(a.space);
      if (typeof a.body === 'string') {
        const body = a.body;
        const mode = str(a.mode) || 'replace';
        if (mode === 'replace' && !body.trim()) fail('body is empty. Use delete_note to remove a note.');
        const [first, ...rest] = n.body.split('\n');
        const next =
          mode === 'append' ? `${n.body.replace(/\s+$/, '')}\n\n${body}` : mode === 'prepend' ? `${first}\n\n${body}\n${rest.join('\n').replace(/^\n+/, '\n')}` : body;
        updateNote(n.id, next);
      } else if (a.space === undefined && a.pinned === undefined) {
        fail('give body, space or pinned');
      }
      if (space) moveNote(n.id, space);
      if (typeof a.pinned === 'boolean' && !!n.pinned !== a.pinned) togglePin(n.id);
      return { updated: noteOut(findNoteBy(n.id)) };
    },
  },
  {
    name: 'delete_note',
    title: 'Delete a note',
    description: 'Delete a note. Only do it when the user asked for it. undo_delete puts it back until the page is reloaded.',
    inputSchema: obj({ note: S('Note id or title.') }, ['note']),
    annotations: { consequentialHint: true },
    execute: (a) => {
      const n = findNoteBy(a.note);
      deleteNote(n.id);
      binned(`note "${titleOf(n)}"`, () => notes.update((list) => (list.some((x) => x.id === n.id) ? list : [n, ...list])));
      return { deleted: { id: n.id, title: titleOf(n) }, undo: 'undo_delete puts it back' };
    },
  },
  {
    name: 'list_reminders',
    title: 'List reminders',
    description: 'List what is on the calendar between two days: task due dates (and the coming times of repeating tasks) and dates written in notes. Defaults to the next 14 days.',
    inputSchema: obj({ from: S('First day, YYYY-MM-DD. Default: today.'), to: S('Last day, YYYY-MM-DD. Default: 14 days after from.'), includeDone: { type: 'boolean', default: false } }),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (a) => {
      const from = str(a.from) ? dueValue(a.from).slice(0, 10) : ymd(new Date());
      const to = str(a.to) ? dueValue(a.to).slice(0, 10) : ymd(new Date(new Date(`${from}T12:00`).getTime() + 14 * 864e5));
      const list = get(reminders).filter((r) => r.day >= from && r.day <= to && (a.includeDone === true || !r.done));
      return {
        from,
        to,
        reminders: list.slice(0, 200).map((r) => ({
          day: r.day,
          ...(r.time ? { time: r.time } : {}),
          what: r.label,
          kind: r.kind,
          space: spaceName(get(projects), r.projectId),
          ...(r.repeat ? { repeat: r.repeat } : {}),
          ...(r.done ? { done: true } : {}),
        })),
      };
    },
  },
  {
    name: 'search',
    title: 'Search',
    description: 'Search tasks and notes together, best match first.',
    inputSchema: obj({ query: S('Words to look for.') }, ['query']),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (a) => ({ results: hooks.search(str(a.query)) }),
  },
  {
    name: 'get_task',
    title: 'Read one task',
    description: 'Everything about one task: text, notes, due date, repeat rule, sub-tasks, focus time and when it was made.',
    inputSchema: obj({ task: TASK_REF }, ['task']),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (a) => {
      const t = findTask(a.task);
      return {
        ...taskOut(t),
        created: new Date(t.createdAt).toISOString(),
        ...(t.doneAt ? { finished: new Date(t.doneAt).toISOString() } : {}),
        ...(t.timesDone ? { timesDone: t.timesDone } : {}),
        subtasks: get(tasks)
          .filter((x) => x.parentId === t.id)
          .map(taskOut),
      };
    },
  },
  {
    name: 'add_tasks',
    title: 'Add several tasks',
    description: 'Add many tasks in one call, each with its own due date, repeat rule, notes and sub-tasks. Use it to turn a plan or a list into tasks. At most 50 at a time.',
    inputSchema: obj(
      {
        tasks: {
          type: 'array',
          minItems: 1,
          maxItems: 50,
          description: 'The tasks to add, in order.',
          items: {
            type: 'object',
            properties: {
              text: S('What to do.'),
              due: DUE,
              repeat: REPEAT,
              notes: S('Notes kept with the task.'),
              subtasks: { type: 'array', items: { type: 'string' }, description: 'Sub-tasks, as plain text.' },
            },
            required: ['text'],
            additionalProperties: false,
          },
        },
        space: SPACE,
      },
      ['tasks'],
    ),
    execute: (a) => {
      const items = Array.isArray(a.tasks) ? (a.tasks as Args[]).slice(0, 50) : [];
      if (!items.length) fail('tasks must be a list with at least one task');
      const space = spaceId(a.space);
      // read every date before adding anything, so a bad one adds nothing
      const dues = items.map((it) => (str(it.due) ? dueValue(it.due) : undefined));
      const added: number[] = [];
      const problems: string[] = [];
      items.forEach((it, i) => {
        const t = addTask(str(it.text), { projectId: space });
        if (!t) {
          problems.push(`task ${i + 1} had no text`);
          return;
        }
        if (dues[i]) setDue(t.id, dues[i]);
        if (str(it.repeat) && !setRepeat(t.id, str(it.repeat))) problems.push(`#${t.no}: cannot read the repeat rule "${str(it.repeat)}"`);
        if (str(it.notes)) setTaskNotes(t.id, str(it.notes));
        for (const sub of Array.isArray(it.subtasks) ? it.subtasks : []) if (str(sub)) addTask(str(sub), { parentId: t.id });
        added.push(t.no);
      });
      return { added: added.map((no) => taskOut(findTask(no))), ...(problems.length ? { problems } : {}) };
    },
  },
  {
    name: 'clear_done_tasks',
    title: 'Clear finished tasks',
    description: 'Remove every finished task, in one space or everywhere. Open sub-tasks of a finished task stay. Only do it when the user asked for it. undo_delete puts them back.',
    inputSchema: obj({ space: SPACE }),
    annotations: { consequentialHint: true },
    execute: (a) => {
      const space = spaceId(a.space);
      const before = get(tasks);
      const done = new Set(before.filter((t) => t.done && (!space || projectOf(t) === space)).map((t) => t.id));
      if (!done.size) return { cleared: 0 };
      tasks.set(before.filter((t) => !done.has(t.id)).map((t) => (t.parentId && done.has(t.parentId) ? { ...t, parentId: undefined } : t)));
      binned(`${done.size} finished tasks`, () =>
        tasks.update((list) => {
          const now = new Map(list.map((t) => [t.id, t] as const));
          const made = list.filter((t) => !before.some((b) => b.id === t.id));
          return [...before.map((b) => (done.has(b.id) ? b : { ...(now.get(b.id) ?? b), parentId: b.parentId })).filter((b) => done.has(b.id) || now.has(b.id)), ...made];
        }),
      );
      return { cleared: done.size, undo: 'undo_delete puts them back' };
    },
  },
  {
    name: 'rename_space',
    title: 'Rename a space',
    description: 'Give a space a new name. Its tasks and notes stay in it.',
    inputSchema: obj({ space: SPACE, name: S('The new name.') }, ['space', 'name']),
    execute: (a) => {
      const id = spaceId(a.space);
      if (!id) fail('space is required');
      if (id === INBOX_ID) fail('the Inbox cannot be renamed');
      const name = str(a.name);
      if (!name) fail('name is required');
      if (get(projects).some((p) => p.id !== id && p.name.toLowerCase() === name.toLowerCase())) fail(`there is already a space called "${name}"`);
      renameProject(id, name);
      return { renamed: spaceName(get(projects), id) };
    },
  },
  {
    name: 'delete_space',
    title: 'Delete a space',
    description: 'Delete a space. Its tasks and notes are kept and move to the Inbox. Only do it when the user asked for it. undo_delete puts the space back with what was in it.',
    inputSchema: obj({ space: SPACE }, ['space']),
    annotations: { consequentialHint: true },
    execute: (a) => {
      const id = spaceId(a.space);
      if (!id) fail('space is required');
      if (id === INBOX_ID) fail('the Inbox cannot be deleted');
      const space = get(projects).find((p) => p.id === id)!;
      const taskIds = new Set(get(tasks).filter((t) => projectOf(t) === id).map((t) => t.id));
      const noteIds = new Set(get(notes).filter((n) => noteSpace(n) === id).map((n) => n.id));
      if (!hooks.deleteSpace(id)) fail('could not delete that space');
      binned(`space "${space.name}"`, () => {
        projects.update((list) => (list.some((p) => p.id === id) ? list : [...list, space]));
        tasks.update((list) => list.map((t) => (taskIds.has(t.id) ? { ...t, projectId: id } : t)));
        notes.update((list) => list.map((n) => (noteIds.has(n.id) ? { ...n, spaceId: id } : n)));
      });
      return { deleted: space.name, movedToInbox: { tasks: taskIds.size, notes: noteIds.size }, undo: 'undo_delete puts it back' };
    },
  },
  {
    name: 'edit_note',
    title: 'Edit part of a note',
    description:
      'Change one passage of a note without resending the rest: find an exact piece of text and replace it. Use it to tick a checkbox ("- [ ] buy milk" to "- [x] buy milk"), fix a line or insert text after a heading. The text to find must match exactly, and only once unless all is true.',
    inputSchema: obj(
      {
        note: S('Note id or title.'),
        find: S('The exact text to replace, as it appears in the note.'),
        replace: S('What to put in its place. Empty removes the text.'),
        all: { type: 'boolean', description: 'Replace every match instead of requiring exactly one.', default: false },
      },
      ['note', 'find', 'replace'],
    ),
    execute: (a) => {
      const n = findNoteBy(a.note);
      const find = typeof a.find === 'string' ? a.find : '';
      const to = typeof a.replace === 'string' ? a.replace : '';
      if (!find) fail('find is required');
      const count = n.body.split(find).length - 1;
      if (!count) fail('that text is not in the note. Read it with read_note and copy the passage exactly.');
      if (count > 1 && a.all !== true) fail(`that text is in the note ${count} times. Give a longer passage, or pass all: true.`);
      const next = n.body.split(find).join(to);
      if (!next.trim()) fail('that would empty the note. Use delete_note to remove it.');
      updateNote(n.id, next);
      return { replaced: count, updated: noteOut(findNoteBy(n.id)) };
    },
  },
  {
    name: 'undo_delete',
    title: 'Undo a delete',
    description: 'Put back the last thing deleted through these tools: a task with its sub-tasks, a note, a space, or the finished tasks that were cleared. Call it again for the one before. Works until the page is reloaded.',
    inputSchema: obj({}),
    execute: () => {
      const last = trash.pop();
      if (!last) fail('nothing to put back: these tools have not deleted anything since the page was opened');
      last.restore();
      return { restored: last.what, moreToUndo: trash.length };
    },
  },
  {
    name: 'get_stats',
    title: 'Focus and usage stats',
    description: 'How the last days went: per day, the focus minutes and pomodoro sessions, tasks finished and added, and time spent on this page. Also the tasks with the most focus time. Use it for a review of the day or week.',
    inputSchema: obj({ days: { type: 'integer', minimum: 1, maximum: 90, default: 7, description: 'How many days back, counting today.' } }),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (a) => {
      const n = Math.min(90, Math.max(1, typeof a.days === 'number' ? Math.round(a.days) : 7));
      const focus = load<Record<string, { minutes: number; sessions: number }>>('pomodoro:stats', {});
      const all = get(tasks);
      const days = lastDays(load<Record<string, { total: number }>>('screentime:days', {}), n).map(({ key, day }) => ({
        day: key,
        focusMinutes: Math.round(focus[key]?.minutes ?? 0),
        pomodoros: focus[key]?.sessions ?? 0,
        tasksFinished: all.filter((t) => t.doneAt && ymd(new Date(t.doneAt)) === key).length,
        tasksAdded: all.filter((t) => ymd(new Date(t.createdAt)) === key).length,
        minutesOnPage: Math.round(day.total / 60),
      }));
      const sum = (k: 'focusMinutes' | 'pomodoros' | 'tasksFinished' | 'tasksAdded' | 'minutesOnPage') => days.reduce((x, d) => x + d[k], 0);
      return {
        days,
        total: { focusMinutes: sum('focusMinutes'), pomodoros: sum('pomodoros'), tasksFinished: sum('tasksFinished'), tasksAdded: sum('tasksAdded'), minutesOnPage: sum('minutesOnPage') },
        mostFocusedTasks: all
          .filter((t) => t.spentMs)
          .sort((x, y) => (y.spentMs ?? 0) - (x.spentMs ?? 0))
          .slice(0, 10)
          .map((t) => ({ number: t.no, text: t.text, focusMinutes: Math.round((t.spentMs ?? 0) / 60000), done: t.done })),
      };
    },
  },
  {
    name: 'export_backup',
    title: 'Export everything',
    description: 'Everything stored on this page as one backup: tasks, notes, spaces, settings and layout. It can be large, so prefer the list tools for questions. The user can restore it with the "backup" command.',
    inputSchema: obj({}),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: () => snapshot(),
  },
];

/** The group a tool is listed under by the `mcp` command and the local server. */
export function groupOf(name: string): string {
  if (name === 'get_overview' || name === 'search' || name === 'get_stats' || name === 'export_backup' || name === 'undo_delete') return 'everything';
  if (/task/.test(name)) return 'tasks';
  if (/note/.test(name)) return 'notes';
  if (/space/.test(name)) return 'spaces';
  if (name === 'list_reminders') return 'calendar';
  if (/pomodoro/.test(name)) return 'focus';
  if (/music|station/.test(name)) return 'music';
  return 'the page';
}
