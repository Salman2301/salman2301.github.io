import { get, writable } from 'svelte/store';
import { tokenize, splitChain } from '../terminal/parse';
import { createNote, deleteNote, moveNote, noteSpace, notes, sortNotes, titleOf, togglePin, updateNote, type Note } from '../widgets/notes/store';
import * as pomo from '../widgets/pomodoro/engine';
import { radioFavs, radioPrefs, radioState, setVolume, tune } from '../widgets/radio/player';
import { findStation, GENRES, STATIONS } from '../widgets/radio/stations';
import { snapshot } from './backup';
import { resolveDateWord, ymd } from './dates';
import { openMention } from './mentions';
import { musicSource, nowPlaying, pauseMusic, playMusic, stepMusic, useSource } from './music';
import { commandHelp, commandNames, getCommand, getWidget, widgets } from './registry';
import { reminders } from './reminders';
import { lastDays, screenTime } from './screentime';
import { search } from './search';
import { ALL, activeSpace, chooseTheme, deleteSpace, setActiveSpace, spaceName } from './spaces';
import { allTemplates, applyTemplate } from './templates';
import { setThemeMode, themeMode, themeNames, themeStore, THEME_MODES, type ThemeMode } from './theme';
import {
  activeTaskId,
  addProject,
  addTask,
  INBOX_ID,
  moveTask,
  projectOf,
  projects,
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
  type Task,
} from './tasks';
import { closePane, leaves, newTab, openWidget, switchTab, workspace } from './workspace';

/**
 * WebMCP: the page offers its tasks, notes, reminders and commands as tools
 * to an AI agent running in the browser (https://webmachinelearning.github.io/webmcp/).
 * The tools act on the live stores, so the open panes update as the agent works.
 *
 * The API is `document.modelContext` in the current draft and was
 * `navigator.modelContext` in earlier ones; both are tried. In a browser
 * with neither, nothing happens.
 */

type Args = Record<string, unknown>;

export interface WebTool {
  name: string;
  title: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
  annotations?: { readOnlyHint?: boolean; consequentialHint?: boolean; untrustedContentHint?: boolean };
  execute(args: Args): unknown | Promise<unknown>;
}

/** What an agent did here, newest last. Shown by `mcp log`. Kept for this visit only. */
export interface ToolCall {
  at: number;
  tool: string;
  ok: boolean;
  /** The arguments, shortened, or the error. */
  detail: string;
}
export const webmcpLog = writable<ToolCall[]>([]);

/**
 * Things an agent removed, so `undo_delete` can put them back. Kept in memory
 * for this visit: a reload empties it.
 */
const trash: { what: string; restore: () => void }[] = [];
function binned(what: string, restore: () => void) {
  trash.push({ what, restore });
  if (trash.length > 30) trash.shift();
}

/** 'on' once the tools are registered, 'unsupported' when the browser has no WebMCP. */
export const webmcpStatus = writable<'off' | 'on' | 'unsupported' | 'error'>('off');

/* ---------------------------------------------------------------- helpers */

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

function fail(message: string): never {
  throw new Error(message);
}

/** A space by name or id. Empty means "not given". */
function spaceId(value: unknown): string | undefined {
  const q = str(value).toLowerCase();
  if (!q) return undefined;
  const list = get(projects);
  const hit = list.find((p) => p.id.toLowerCase() === q) ?? list.find((p) => p.name.toLowerCase() === q);
  if (!hit) fail(`no space called "${str(value)}". Spaces: ${list.map((p) => p.name).join(', ')}`);
  return hit.id;
}

/** A task by its number (12 or "#12") or id. */
function findTask(value: unknown): Task {
  const q = str(value).replace(/^#/, '');
  if (!q) fail('give the task number, for example 12');
  const t = /^\d+$/.test(q) ? taskByNo(Number(q)) : get(tasks).find((x) => x.id === q);
  if (!t) fail(`no task ${/^\d+$/.test(q) ? '#' : ''}${q}. Use list_tasks to see the numbers.`);
  return t;
}

/** A note by id, exact title, or the start of a title. */
function findNoteBy(value: unknown): Note {
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

function taskOut(t: Task) {
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

/** Run a terminal command line without a terminal, collecting what it prints. */
async function runHeadless(line: string): Promise<string> {
  const out: string[] = [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const paneId = get(workspace).focused;
  const runOne = async (part: string) => {
    const [name, ...args] = tokenize(part);
    if (!name) return;
    const cmd = getCommand(name);
    if (!cmd) fail(`command not found: ${name}. Commands: ${commandNames().join(', ')}`);
    if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
      out.push(commandHelp(cmd));
      return;
    }
    await cmd.run({
      raw: part,
      args,
      paneId,
      print: (text) => out.push(text),
      render: () => out.push('(showed a view in the page)'),
      clear: () => undefined,
      run: runAll,
      signal: controller.signal,
    });
  };
  async function runAll(l: string) {
    for (const part of splitChain(l)) await runOne(part);
  }
  try {
    await runAll(line);
  } finally {
    clearTimeout(timer);
  }
  return out.join('\n');
}

const clock = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

function pomodoroOut() {
  const p = get(pomo.pomodoro);
  const left = p.running && p.endsAt ? p.endsAt - Date.now() : p.remainingMs;
  const active = get(tasks).find((t) => t.id === get(activeTaskId) && !t.done);
  return {
    mode: pomo.MODE_LABEL[p.mode],
    running: p.running,
    remaining: clock(left),
    minutes: { focus: p.durations.focus, shortBreak: p.durations.short, longBreak: p.durations.long },
    sessionsInThisSet: p.cycle,
    ...(active ? { focusedTask: { number: active.no, text: active.text } } : {}),
  };
}

function musicOut() {
  const n = get(nowPlaying);
  const out: Record<string, unknown> = { source: n.source, title: n.title, state: n.error ? 'error' : n.busy ? 'connecting' : n.live ? 'playing' : 'stopped' };
  if (n.source === 'radio') {
    out.volume = Math.round(get(radioPrefs).volume * 100);
    const r = get(radioState);
    if (n.error) out.error = r.error || 'the stream did not start';
    // the browser refused to start sound without a click on the page
    else if (!n.live && r.error) out.blocked = 'The browser will not start sound until the user clicks the page once. Ask them to press play, or to click anywhere and try again.';
  }
  return out;
}

function panesOut() {
  const s = get(workspace);
  return leaves(s.root).map((l, i) => {
    const def = getWidget(l.widget);
    return { pane: i + 1, widget: l.widget, title: def?.paneTitle?.(l.config ?? {}) ?? def?.title ?? l.widget, ...(s.focused === l.id ? { focused: true } : {}) };
  });
}

const activeSpaceName = () => {
  const id = get(activeSpace);
  return id === ALL ? 'all spaces' : spaceName(get(projects), id);
};

/** Wait for a store-driven change (a stream connecting, a pane mounting) to settle. */
const settle = (ms = 350) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ tools */

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object' as const, properties, required, additionalProperties: false });
const S = (description: string, extra: Record<string, unknown> = {}) => ({ type: 'string', description, ...extra });
const TASK_REF = { type: ['integer', 'string'], description: 'The task number shown as #n, for example 12.' };
const DUE = S('Due date or reminder: YYYY-MM-DD, YYYY-MM-DD HH:MM, or a word such as today, tomorrow, monday, nextweek.');
const REPEAT = S('Repeat rule: daily, weekdays, weekly, monthly, yearly, or "every mon, thu", "every 2 weeks".');
const SPACE = S('Space name (a named group of tasks and notes), for example Inbox.');

export const TOOLS: WebTool[] = [
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
    execute: (a) => ({
      results: search(str(a.query), 25)
        .filter((r) => r.kind === 'task' || r.kind === 'note')
        .map((r) => ({ kind: r.kind, title: r.title, ...(r.detail ? { detail: r.detail } : {}), ...(r.meta ? { meta: r.meta } : {}), ...(r.kind === 'note' ? { id: r.key.slice(5) } : {}) })),
    }),
  },
  {
    name: 'show',
    title: 'Show a task or note',
    description: 'Bring a task or a note into view in the page, opening its pane if needed.',
    inputSchema: obj({ task: TASK_REF, note: S('Note id or title.') }),
    execute: (a) => {
      if (str(a.task)) {
        const t = findTask(a.task);
        openMention('task', t.id);
        return { showing: `task #${t.no}` };
      }
      const n = findNoteBy(a.note);
      openMention('note', n.id);
      return { showing: `note "${titleOf(n)}"` };
    },
  },
  {
    name: 'get_overview',
    title: 'Overview of today',
    description:
      'Start here. One call that says what the user has on: the date and time, overdue tasks, what is due today and in the next 7 days, the task in focus, the pomodoro timer, what music is playing, the spaces, and which panes are open.',
    inputSchema: obj({}),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: () => {
      const now = new Date();
      const today = ymd(now);
      const week = ymd(new Date(now.getTime() + 7 * 864e5));
      const open = get(tasks).filter((t) => !t.done);
      const brief = (t: Task) => ({ number: t.no, text: t.text, due: t.due, space: spaceName(get(projects), projectOf(t)), ...(t.repeat ? { repeat: t.repeat } : {}) });
      const byDue = (a: Task, b: Task) => (a.due ?? '').localeCompare(b.due ?? '');
      const s = get(workspace);
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
        pomodoro: pomodoroOut(),
        music: musicOut(),
        spaces: get(projects).map((p) => ({ name: p.name, openTasks: open.filter((t) => projectOf(t) === p.id).length, notes: get(notes).filter((n) => noteSpace(n) === p.id).length })),
        page: { tab: s.tabs.find((t) => t.id === s.active)?.name, showing: activeSpaceName(), theme: get(themeStore), panes: panesOut() },
      };
    },
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
      if (!deleteSpace(id)) fail('could not delete that space');
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
    name: 'control_pomodoro',
    title: 'Pomodoro timer',
    description:
      'Read or drive the pomodoro timer. status only reads it. start, pause, reset and skip act on the current period. With task, start focuses the timer on that task so its time is counted. mode switches between focus and the breaks, and minutes sets how long that period lasts.',
    inputSchema: obj(
      {
        action: S('What to do.', { enum: ['status', 'start', 'pause', 'reset', 'skip'] }),
        task: TASK_REF,
        mode: S('Switch to this period first.', { enum: ['focus', 'short', 'long'] }),
        minutes: { type: 'number', minimum: 1, maximum: 600, description: 'Length of the period in minutes (of mode when given, else of the current one).' },
      },
      ['action'],
    ),
    execute: (a) => {
      const action = str(a.action);
      if (!['status', 'start', 'pause', 'reset', 'skip'].includes(action)) fail('action must be status, start, pause, reset or skip');
      if (action === 'status') return pomodoroOut();
      const mode = str(a.mode) as pomo.Mode | '';
      if (mode && !['focus', 'short', 'long'].includes(mode)) fail('mode must be focus, short or long');
      const task = str(a.task) ? findTask(a.task) : undefined;
      if (task?.done) fail(`#${task.no} is done`);
      if (mode && get(pomo.pomodoro).mode !== mode) pomo.setMode(mode);
      if (typeof a.minutes === 'number') {
        const target = mode || get(pomo.pomodoro).mode;
        pomo.setDurations({ [target]: a.minutes });
        if (!get(pomo.pomodoro).running) pomo.reset();
      }
      if (task) {
        setActiveTask(task.id);
        if (action === 'start' && get(pomo.pomodoro).mode !== 'focus') pomo.setMode('focus');
      }
      if (action === 'start') pomo.start();
      else if (action === 'pause') pomo.pause();
      else if (action === 'reset') pomo.reset();
      else pomo.skip();
      return pomodoroOut();
    },
  },
  {
    name: 'control_music',
    title: 'Music',
    description:
      'Read or drive the music player (internet radio or the Spotify player). status only reads it. play and pause act on the current source, next and previous step through stations or playlists. station tunes the radio to a station by name (see list_stations). volume is 0 to 100 and applies to the radio. A browser may refuse to start sound until the user has clicked the page.',
    inputSchema: obj(
      {
        action: S('What to do.', { enum: ['status', 'play', 'pause', 'next', 'previous'] }),
        station: S('Radio station name or short name, for example "FIP" or "fip".'),
        volume: { type: 'number', minimum: 0, maximum: 100, description: 'Radio volume, 0 to 100.' },
        source: S('Which player the controls act on, when nothing is playing.', { enum: ['radio', 'spotify'] }),
      },
      ['action'],
    ),
    execute: async (a) => {
      const action = str(a.action);
      if (!['status', 'play', 'pause', 'next', 'previous'].includes(action)) fail('action must be status, play, pause, next or previous');
      const station = str(a.station) ? findStation(str(a.station)) ?? STATIONS.find((s) => s.name.toLowerCase().includes(str(a.station).toLowerCase())) : undefined;
      if (str(a.station) && !station) fail(`no station called "${str(a.station)}". Use list_stations to see them.`);
      if (typeof a.volume === 'number') setVolume(a.volume / 100);
      if (str(a.source) === 'radio' || str(a.source) === 'spotify') useSource(str(a.source) as 'radio' | 'spotify');
      if (action === 'status') return musicOut();
      if (action === 'pause') pauseMusic();
      else if (station) {
        pauseMusic();
        musicSource.set('radio');
        tune(station);
      } else if (action === 'play') playMusic();
      else stepMusic(action === 'next' ? 1 : -1);
      await settle(900);
      return musicOut();
    },
  },
  {
    name: 'list_stations',
    title: 'List radio stations',
    description: 'The internet radio stations that control_music can tune to, with their genre and whether the user marked them as a favourite.',
    inputSchema: obj({ genre: S('Only this genre.', { enum: [...GENRES] }), favouritesOnly: { type: 'boolean', default: false } }),
    annotations: { readOnlyHint: true },
    execute: (a) => {
      const favs = get(radioFavs);
      const genre = str(a.genre);
      const list = STATIONS.filter((s) => (!genre || s.genre === genre) && (a.favouritesOnly !== true || favs.includes(s.slug)));
      return { count: list.length, stations: list.map((s) => ({ name: s.name, short: s.slug, genre: s.genre, about: s.note, ...(favs.includes(s.slug) ? { favourite: true } : {}) })) };
    },
  },
  {
    name: 'get_workspace',
    title: 'Read the page layout',
    description: 'What is on screen and what could be: the tabs, the panes open in this tab, which space is showing, the theme, and the widgets, layouts and themes that can be chosen.',
    inputSchema: obj({}),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: () => {
      const s = get(workspace);
      return {
        tabs: s.tabs.map((t) => ({ name: t.name, ...(t.id === s.active ? { active: true } : {}), showing: t.space ? spaceName(get(projects), t.space) : 'all spaces' })),
        panes: panesOut(),
        showing: activeSpaceName(),
        theme: { current: get(themeStore), mode: get(themeMode), available: themeNames },
        widgets: widgets.filter((w) => !w.hidden).map((w) => ({ id: w.id, title: w.title, about: w.description })),
        layouts: allTemplates().map((t) => ({ id: t.id, title: t.title, about: t.description })),
      };
    },
  },
  {
    name: 'open_pane',
    title: 'Open a pane',
    description: 'Open a widget in a pane: todo, notes, calendar, clock, pomodoro, radio, spotify, reminders, screentime, terminal and others (get_workspace lists them). An open pane of that widget is brought into focus unless another is asked for.',
    inputSchema: obj({ widget: S('Widget id, for example "notes".'), another: { type: 'boolean', description: 'Open a second pane even when one is already open.', default: false } }, ['widget']),
    execute: async (a) => {
      const id = str(a.widget).toLowerCase();
      const def = getWidget(id) ?? widgets.find((w) => w.title.toLowerCase() === id);
      if (!def) fail(`no widget called "${str(a.widget)}". Widgets: ${widgets.filter((w) => !w.hidden).map((w) => w.id).join(', ')}`);
      openWidget(def.id, undefined, { reuse: a.another !== true });
      await settle();
      return { opened: def.title, panes: panesOut() };
    },
  },
  {
    name: 'close_pane',
    title: 'Close a pane',
    description: 'Close a pane of this tab, by its number from get_workspace or by widget id. What the pane showed is not lost: tasks, notes and settings are kept.',
    inputSchema: obj({ pane: { type: ['integer', 'string'], description: 'Pane number (1 is the first) or widget id such as "clock".' } }, ['pane']),
    execute: async (a) => {
      const q = str(a.pane).toLowerCase();
      const all = leaves(get(workspace).root);
      const target = /^\d+$/.test(q) ? all[Number(q) - 1] : all.find((l) => l.widget === q);
      if (!target) fail(`no pane "${str(a.pane)}". Open panes: ${all.map((l, i) => `${i + 1} ${l.widget}`).join(', ')}`);
      const result = closePane(target.id);
      if (result === 'none') fail('that is the only pane of the only tab, so it stays');
      await settle();
      return { closed: target.widget, panes: panesOut() };
    },
  },
  {
    name: 'apply_layout',
    title: 'Apply a layout',
    description: 'Replace the panes of this tab with a ready-made layout (get_workspace lists them). The panes open now are closed; tasks and notes are not affected.',
    inputSchema: obj({ layout: S('Layout id or title.') }, ['layout']),
    execute: async (a) => {
      if (!applyTemplate(str(a.layout))) fail(`no layout called "${str(a.layout)}". Layouts: ${allTemplates().map((t) => t.id).join(', ')}`);
      await settle();
      return { applied: str(a.layout), panes: panesOut() };
    },
  },
  {
    name: 'open_tab',
    title: 'Open or switch tab',
    description: 'Switch to the tab with this name, or make a new tab with it. Each tab has its own panes and can show one space.',
    inputSchema: obj({ name: S('Tab name.'), space: S('Show only this space in the tab, or "all".') }, ['name']),
    execute: async (a) => {
      const name = str(a.name);
      if (!name) fail('name is required');
      const space = str(a.space).toLowerCase() === 'all' ? ALL : spaceId(a.space);
      const s = get(workspace);
      const hit = s.tabs.find((t) => t.name.toLowerCase() === name.toLowerCase());
      if (hit) switchTab(hit.id);
      else newTab(name);
      if (space) setActiveSpace(space);
      await settle();
      return { tab: name, made: !hit, showing: activeSpaceName(), panes: panesOut() };
    },
  },
  {
    name: 'show_space',
    title: 'Show one space',
    description: 'Make this tab show the tasks, notes and reminders of one space only, or of every space with "all".',
    inputSchema: obj({ space: S('Space name, or "all".') }, ['space']),
    execute: (a) => {
      setActiveSpace(str(a.space).toLowerCase() === 'all' ? ALL : spaceId(a.space) ?? ALL);
      return { showing: activeSpaceName() };
    },
  },
  {
    name: 'set_theme',
    title: 'Change the theme',
    description: 'Change how the page looks: pick a colour theme by name (get_workspace lists them), or set the mode to dark, light or system.',
    inputSchema: obj({ theme: S('Theme name.'), mode: S('Follow the system, or stay dark or light.', { enum: [...THEME_MODES] }) }),
    execute: (a) => {
      const theme = str(a.theme).toLowerCase();
      const mode = str(a.mode).toLowerCase();
      if (!theme && !mode) fail('give theme or mode');
      if (mode && !THEME_MODES.includes(mode as ThemeMode)) fail('mode must be system, dark or light');
      if (mode) setThemeMode(mode as ThemeMode);
      if (theme && !chooseTheme(theme)) fail(`no theme called "${theme}". Themes: ${themeNames.join(', ')}`);
      return { theme: get(themeStore), mode: get(themeMode) };
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
      const focus = get(pomo.pomodoroStats);
      const all = get(tasks);
      const days = lastDays(get(screenTime), n).map(({ key, day }) => ({
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
  {
    name: 'run_command',
    title: 'Run a terminal command',
    description:
      'Run a command of the site\'s built-in terminal and get what it prints. Use it for everything the other tools do not cover: opening panes (clock, calendar, notes, todo, radio), the pomodoro timer ("pomodoro start"), music ("radio next", "spotify pause"), themes ("theme"), tabs and layout. Run "help" to list the commands and "<command> --help" for one of them.',
    inputSchema: obj({ command: S('The command line, for example "pomodoro start" or "clock diver".') }, ['command']),
    execute: async (a) => {
      const line = str(a.command);
      if (!line) fail('command is required');
      return { output: (await runHeadless(line)) || '(done, nothing printed)' };
    },
  },
];

/* ----------------------------------------------------------- registration */

interface ModelContextLike {
  registerTool(tool: unknown, options?: { signal?: AbortSignal }): unknown;
}

function modelContext(): ModelContextLike | null {
  try {
    const mc = (document as unknown as { modelContext?: ModelContextLike }).modelContext ?? (navigator as unknown as { modelContext?: ModelContextLike }).modelContext;
    return mc && typeof mc.registerTool === 'function' ? mc : null;
  } catch {
    return null;
  }
}

/** Run a tool the way an agent does, and note it in the log. */
export async function callTool(tool: WebTool, input: unknown): Promise<unknown> {
  const args = (input && typeof input === 'object' ? input : {}) as Args;
  const note = (ok: boolean, detail: string) => webmcpLog.update((l) => [...l, { at: Date.now(), tool: tool.name, ok, detail: detail.slice(0, 160) }].slice(-100));
  try {
    const out = await tool.execute(args);
    note(true, Object.keys(args).length ? JSON.stringify(args) : '');
    return out;
  } catch (e) {
    note(false, e instanceof Error ? e.message : String(e));
    throw e;
  }
}

/** The group a tool is listed under by the `mcp` command. */
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

let started = false;

/** Offer the tools to the browser's agent. Safe to call anywhere; does nothing without WebMCP. */
export async function startWebMcp() {
  if (started) return;
  started = true;
  const mc = modelContext();
  if (!mc) {
    webmcpStatus.set('unsupported');
    return;
  }
  const controller = new AbortController();
  let ok = 0;
  for (const tool of TOOLS) {
    try {
      await mc.registerTool(
        {
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations ?? {},
          execute: (input: unknown) => callTool(tool, input),
        },
        { signal: controller.signal },
      );
      ok++;
    } catch (e) {
      console.warn(`[webmcp] could not register ${tool.name}`, e);
    }
  }
  webmcpStatus.set(ok ? 'on' : 'error');
}
