import { derived, get, writable } from 'svelte/store';
import { notify, requestNotificationPermission } from '../../core/notify';
import { setStatus } from '../../core/status';
import { persisted } from '../../core/storage';
import { creditPomodoro } from '../../core/tasks';
import { openWidget } from '../../core/workspace';

/**
 * One pomodoro engine shared by every pomodoro pane, the status bar and the
 * commands. Time is stored as timestamps so reloads resume correctly, and it
 * keeps ticking even when no pomodoro pane is open.
 */
export type Mode = 'focus' | 'short' | 'long';

export interface PomodoroState {
  mode: Mode;
  running: boolean;
  endsAt: number | null;
  /** Remaining time while paused or idle. */
  remainingMs: number;
  /** Focus sessions finished in the current set. */
  cycle: number;
  durations: Record<Mode, number>; // minutes
  longEvery: number;
  autoStart: boolean;
}

const DEFAULTS: PomodoroState = {
  mode: 'focus',
  running: false,
  endsAt: null,
  remainingMs: 25 * 60_000,
  cycle: 0,
  durations: { focus: 25, short: 5, long: 15 },
  longEvery: 4,
  autoStart: false,
};

export const MODE_LABEL: Record<Mode, string> = { focus: 'focus', short: 'short break', long: 'long break' };

export const pomodoro = persisted<PomodoroState>('pomodoro:state', DEFAULTS);
/** focus minutes and sessions per local date (YYYY-MM-DD) */
export const pomodoroStats = persisted<Record<string, { minutes: number; sessions: number }>>('pomodoro:stats', {});

const now = writable(Date.now());

export const remainingMs = derived([pomodoro, now], ([$p, $now]) =>
  $p.running && $p.endsAt ? Math.max(0, $p.endsAt - $now) : $p.remainingMs,
);

export const todayKey = () => new Date().toLocaleDateString('en-CA');

export function fmt(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

let asked = false;

export function start() {
  if (!asked) {
    asked = true;
    void requestNotificationPermission();
  }
  pomodoro.update((p) => (p.running ? p : { ...p, running: true, endsAt: Date.now() + p.remainingMs }));
  ensureTicking();
}

export function pause() {
  pomodoro.update((p) =>
    p.running && p.endsAt ? { ...p, running: false, remainingMs: Math.max(0, p.endsAt - Date.now()), endsAt: null } : p,
  );
}

export function toggle() {
  if (get(pomodoro).running) pause();
  else start();
}

export function reset() {
  pomodoro.update((p) => ({ ...p, running: false, endsAt: null, remainingMs: p.durations[p.mode] * 60_000 }));
}

export function setMode(mode: Mode) {
  pomodoro.update((p) => ({ ...p, mode, running: false, endsAt: null, remainingMs: p.durations[mode] * 60_000 }));
}

export function setDurations(d: Partial<Record<Mode, number>>) {
  pomodoro.update((p) => {
    const durations = { ...p.durations };
    for (const k of Object.keys(d) as Mode[]) {
      const v = d[k];
      if (v && v > 0 && v <= 600) durations[k] = Math.round(v);
    }
    const idle = !p.running && p.remainingMs === p.durations[p.mode] * 60_000;
    return { ...p, durations, remainingMs: idle || !p.running ? durations[p.mode] * 60_000 : p.remainingMs };
  });
}

export function setAutoStart(v: boolean) {
  pomodoro.update((p) => ({ ...p, autoStart: v }));
}

/** Finish the current period now (skip). Credits focus time only when it ran to the end. */
export function skip() {
  advance(false);
}

function advance(completed: boolean) {
  const p = get(pomodoro);
  let cycle = p.cycle;
  let next: Mode;
  if (p.mode === 'focus') {
    if (completed) {
      pomodoroStats.update((s) => {
        const k = todayKey();
        const cur = s[k] ?? { minutes: 0, sessions: 0 };
        return { ...s, [k]: { minutes: cur.minutes + p.durations.focus, sessions: cur.sessions + 1 } };
      });
      creditPomodoro();
    }
    cycle += 1;
    next = cycle % p.longEvery === 0 ? 'long' : 'short';
  } else {
    next = 'focus';
    if (p.mode === 'long') cycle = 0;
  }
  const auto = completed && p.autoStart;
  const ms = p.durations[next] * 60_000;
  pomodoro.set({ ...p, mode: next, cycle, running: auto, endsAt: auto ? Date.now() + ms : null, remainingMs: ms });
  if (completed) {
    notify(p.mode === 'focus' ? 'Focus session done' : 'Break is over', {
      body: p.mode === 'focus' ? `Time for a ${MODE_LABEL[next]}.` : 'Back to focus.',
      tone: 'success',
      sound: true,
      system: true,
      durationMs: 8000,
    });
  }
  if (auto) ensureTicking();
}

/* ------------------------------------------------------------- ticking */

let interval: ReturnType<typeof setInterval> | undefined;
let baseTitle = '';

function tick() {
  const t = Date.now();
  now.set(t);
  const p = get(pomodoro);
  if (p.running && p.endsAt && p.endsAt <= t) advance(true);
  render();
  if (!get(pomodoro).running && interval) {
    clearInterval(interval);
    interval = undefined;
  }
}

function ensureTicking() {
  if (!interval) interval = setInterval(tick, 250);
  tick();
}

/** Status bar item and tab title. */
function render() {
  if (typeof document === 'undefined') return;
  if (!baseTitle) baseTitle = document.title;
  const p = get(pomodoro);
  const ms = get(remainingMs);
  const active = p.running || ms !== p.durations[p.mode] * 60_000;
  if (active) {
    setStatus('pomodoro', {
      text: `${p.running ? '' : 'paused '}${MODE_LABEL[p.mode]} ${fmt(ms)}`,
      tone: p.running ? 'accent' : 'muted',
      order: 10,
      title: 'Pomodoro (click to open)',
      onClick: () => openWidget('pomodoro'),
    });
  } else setStatus('pomodoro', null);
  document.title = p.running ? `${fmt(ms)} ${MODE_LABEL[p.mode]} | ${baseTitle}` : baseTitle;
}

pomodoro.subscribe(() => {
  // run after the store settles so the status bar reflects every change
  setTimeout(render, 0);
});

// resume after a reload
if (get(pomodoro).running) ensureTicking();
