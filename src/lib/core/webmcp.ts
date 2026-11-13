import { get, writable } from 'svelte/store';
import { tokenize, splitChain } from '../terminal/parse';
import { titleOf } from '../widgets/notes/store';
import * as pomo from '../widgets/pomodoro/engine';
import { radioFavs, radioPrefs, radioState, setVolume, tune } from '../widgets/radio/player';
import { findStation, GENRES, STATIONS } from '../widgets/radio/stations';
import { DATA_TOOLS, fail, findNoteBy, findTask, groupOf, hooks, obj, S, spaceId, spaceName, str, TASK_REF, type Args, type WebTool } from './agent-tools';
import { openMention } from './mentions';
import { musicSource, nowPlaying, pauseMusic, playMusic, stepMusic, useSource } from './music';
import { commandHelp, commandNames, getCommand, getWidget, widgets } from './registry';
import { search } from './search';
import { ALL, activeSpace, chooseTheme, deleteSpace, setActiveSpace } from './spaces';
import { allTemplates, applyTemplate } from './templates';
import { setThemeMode, themeMode, themeNames, themeStore, THEME_MODES, type ThemeMode } from './theme';
import { activeTaskId, projects, setActiveTask, tasks } from './tasks';
import { closePane, leaves, newTab, openWidget, switchTab, workspace } from './workspace';

export { groupOf };
export type { WebTool };

/**
 * WebMCP: the page offers its tasks, notes, reminders and commands as tools
 * to an AI agent running in the browser (https://webmachinelearning.github.io/webmcp/).
 * The tools act on the live stores, so the open panes update as the agent works.
 *
 * The API is `document.modelContext` in the current draft and was
 * `navigator.modelContext` in earlier ones; both are tried. In a browser
 * with neither, nothing happens.
 */
/** What an agent did here, newest last. Shown by `mcp log`. Kept for this visit only. */
export interface ToolCall {
  at: number;
  tool: string;
  ok: boolean;
  /** The arguments, shortened, or the error. */
  detail: string;
}
export const webmcpLog = writable<ToolCall[]>([]);
/** 'on' once the tools are registered, 'unsupported' when the browser has no WebMCP. */
export const webmcpStatus = writable<'off' | 'on' | 'unsupported' | 'error'>('off');
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
/* ------------------------------------------- what the page adds to the data tools */

hooks.overview = () => {
  const s = get(workspace);
  return {
    pomodoro: pomodoroOut(),
    music: musicOut(),
    page: { tab: s.tabs.find((t) => t.id === s.active)?.name, showing: activeSpaceName(), theme: get(themeStore), panes: panesOut() },
  };
};
hooks.search = (query) =>
  search(query, 25)
    .filter((r) => r.kind === 'task' || r.kind === 'note')
    .map((r) => ({ kind: r.kind, title: r.title, ...(r.detail ? { detail: r.detail } : {}), ...(r.meta ? { meta: r.meta } : {}), ...(r.kind === 'note' ? { id: r.key.slice(5) } : {}) }));
hooks.deleteSpace = deleteSpace;

/** Tools that drive the page itself: panes, timer, music, theme, commands. */
const PAGE_TOOLS: WebTool[] = [
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

export const TOOLS: WebTool[] = [...DATA_TOOLS, ...PAGE_TOOLS];

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
