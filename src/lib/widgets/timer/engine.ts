import { get, writable, type Readable } from 'svelte/store';
import { notify, requestNotificationPermission } from '../../core/notify';
import { setStatus } from '../../core/status';
import { persisted } from '../../core/storage';
import { openWidget } from '../../core/workspace';

/**
 * One stopwatch and one countdown, shared by every timer pane, the status
 * bar and the terminal commands. Both are stored as timestamps rather than
 * counted ticks, so they keep the right time across reloads, in background
 * tabs and while no timer pane is open.
 */

export interface StopwatchState {
  running: boolean;
  /** When the current run started (epoch ms). Null while stopped. */
  startedAt: number | null;
  /** Time from earlier runs. */
  accumulated: number;
  /** Total elapsed time at each lap mark, oldest first. */
  laps: number[];
}

export interface CountdownState {
  running: boolean;
  /** Length of the current countdown, including minutes added on the way. */
  durationMs: number;
  /** When it reaches zero, while running. */
  endsAt: number | null;
  /** Time left while paused or idle. */
  remainingMs: number;
  /** When it last reached zero. Cleared by start and reset. */
  doneAt: number | null;
}

export const PRESETS = [1, 3, 5, 10, 15, 25];
export const MAX_MS = 100 * 3_600_000;
const MAX_LAPS = 500;

const SW_DEFAULT: StopwatchState = { running: false, startedAt: null, accumulated: 0, laps: [] };
const CD_DEFAULT: CountdownState = { running: false, durationMs: 5 * 60_000, endsAt: null, remainingMs: 5 * 60_000, doneAt: null };

export const stopwatch = persisted<StopwatchState>('timer:stopwatch', SW_DEFAULT);
export const countdown = persisted<CountdownState>('timer:countdown', CD_DEFAULT);

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const stamp = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Repair whatever came out of storage (old shapes, hand edits). */
function sanitize() {
  stopwatch.update((s) => {
    const startedAt = stamp(s?.startedAt);
    return {
      running: !!s?.running && startedAt !== null,
      startedAt,
      accumulated: Math.max(0, num(s?.accumulated, 0)),
      laps: Array.isArray(s?.laps) ? s.laps.filter((l) => typeof l === 'number' && l >= 0).slice(-MAX_LAPS) : [],
    };
  });
  countdown.update((c) => {
    const durationMs = Math.min(MAX_MS, Math.max(1000, num(c?.durationMs, CD_DEFAULT.durationMs)));
    const endsAt = stamp(c?.endsAt);
    return {
      running: !!c?.running && endsAt !== null,
      durationMs,
      endsAt,
      remainingMs: Math.min(MAX_MS, Math.max(0, num(c?.remainingMs, durationMs))),
      doneAt: stamp(c?.doneAt),
    };
  });
}
sanitize();

/* ------------------------------------------------------------ formatting */

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * "04:05", "1:04:05", with ".07" centiseconds when asked. Countdowns round
 * up so the display reads 00:00 exactly when time is up.
 */
export function formatClock(ms: number, opts: { centis?: boolean; roundUp?: boolean } = {}): string {
  const safe = Math.max(0, ms);
  const totalSec = opts.roundUp ? Math.ceil(safe / 1000) : Math.floor(safe / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const main = h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  return opts.centis ? `${main}.${pad(Math.floor((safe % 1000) / 10))}` : main;
}

/** Human length: "1h 20m", "5m", "1m 30s", "45s". */
export function formatLength(ms: number): string {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts = [h && `${h}h`, m && `${m}m`, s && `${s}s`].filter(Boolean);
  return parts.length ? parts.join(' ') : '0s';
}

/** "14:32" for a timestamp, in the visitor's locale. */
export const formatAt = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * Parse a countdown length: "90" (minutes), "1:30" (m:ss), "1:02:30"
 * (h:mm:ss), "5m", "90s", "1h20m", "1.5h", "2 min". Null when it does not
 * parse or is out of range.
 */
export function parseDuration(text: string): number | null {
  const s = text.trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return null;
  let ms: number | null = null;
  if (/^\d+(\.\d+)?$/.test(s)) ms = Number(s) * 60_000;
  else if (/^\d+:\d{1,2}(:\d{1,2})?$/.test(s)) {
    const parts = s.split(':').map(Number);
    if (parts.slice(1).some((p) => p >= 60)) return null;
    const [a, b, c] = parts;
    ms = parts.length === 3 ? (a * 3600 + b * 60 + c) * 1000 : (a * 60 + b) * 1000;
  } else {
    const m = /^(?:(\d+(?:\.\d+)?)h(?:rs?|ours?)?)?(?:(\d+(?:\.\d+)?)m(?:ins?|inutes?)?)?(?:(\d+(?:\.\d+)?)s(?:ecs?|econds?)?)?$/.exec(s);
    if (m && (m[1] || m[2] || m[3])) ms = (Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)) * 1000;
  }
  if (ms === null || !Number.isFinite(ms)) return null;
  ms = Math.round(ms);
  return ms >= 1000 && ms <= MAX_MS ? ms : null;
}

/* ------------------------------------------------------------- stopwatch */

export function elapsedMs(s: StopwatchState, t = Date.now()): number {
  return s.accumulated + (s.running && s.startedAt !== null ? Math.max(0, t - s.startedAt) : 0);
}

export function swStart() {
  stopwatch.update((s) => (s.running ? s : { ...s, running: true, startedAt: Date.now() }));
  ensureTicking();
}

export function swStop() {
  stopwatch.update((s) => (s.running ? { ...s, running: false, startedAt: null, accumulated: elapsedMs(s) } : s));
}

export function swToggle() {
  if (get(stopwatch).running) swStop();
  else swStart();
}

/** Mark a lap. Returns its number, or 0 when the stopwatch is not running. */
export function swLap(): number {
  const s = get(stopwatch);
  if (!s.running) return 0;
  const laps = [...s.laps, elapsedMs(s)].slice(-MAX_LAPS);
  stopwatch.set({ ...s, laps });
  return laps.length;
}

export function swReset() {
  stopwatch.set({ ...SW_DEFAULT, laps: [] });
}

export interface LapRow {
  n: number;
  lapMs: number;
  totalMs: number;
  best: boolean;
  worst: boolean;
}

/** Laps newest first, with the fastest and slowest marked once there are two or more. */
export function lapRows(laps: number[]): LapRow[] {
  const times = laps.map((total, i) => total - (i ? laps[i - 1] : 0));
  const ranked = times.length >= 2;
  const best = ranked ? times.indexOf(Math.min(...times)) : -1;
  const worst = ranked ? times.indexOf(Math.max(...times)) : -1;
  return times
    .map((lapMs, i) => ({ n: i + 1, lapMs, totalMs: laps[i], best: i === best, worst: i === worst && worst !== best }))
    .reverse();
}

/* ------------------------------------------------------------- countdown */

export function remainingMsOf(c: CountdownState, t = Date.now()): number {
  return c.running && c.endsAt !== null ? Math.max(0, c.endsAt - t) : c.remainingMs;
}

export const isDone = (c: CountdownState) => !c.running && c.remainingMs === 0 && c.doneAt !== null;

let askedPermission = false;
function askPermissionOnce() {
  if (askedPermission) return;
  askedPermission = true;
  void requestNotificationPermission();
}

/** Start a new countdown of `ms`, or resume the current one when no length is given. */
export function cdStart(ms?: number) {
  askPermissionOnce();
  const t = Date.now();
  countdown.update((c) => {
    if (ms !== undefined) {
      const len = Math.min(MAX_MS, Math.max(1000, Math.round(ms)));
      return { running: true, durationMs: len, endsAt: t + len, remainingMs: len, doneAt: null };
    }
    if (c.running) return c;
    const left = c.remainingMs > 0 ? c.remainingMs : c.durationMs;
    return { ...c, running: true, endsAt: t + left, remainingMs: left, doneAt: null };
  });
  ensureTicking();
}

export function cdPause() {
  countdown.update((c) => (c.running ? { ...c, running: false, endsAt: null, remainingMs: remainingMsOf(c) } : c));
}

export function cdToggle() {
  if (get(countdown).running) cdPause();
  else cdStart();
}

export function cdReset() {
  countdown.update((c) => ({ ...c, running: false, endsAt: null, remainingMs: c.durationMs, doneAt: null }));
}

/** Add time. After the countdown finished, this starts a fresh one of that length (a snooze). */
export function cdAdd(ms: number) {
  const c = get(countdown);
  if (isDone(c)) return cdStart(ms);
  const room = MAX_MS - remainingMsOf(c);
  const add = Math.max(0, Math.min(ms, room));
  countdown.set({
    ...c,
    durationMs: Math.min(MAX_MS, c.durationMs + add),
    endsAt: c.running && c.endsAt !== null ? c.endsAt + add : null,
    remainingMs: c.running ? c.remainingMs : c.remainingMs + add,
  });
}

function finish(c: CountdownState, t: number) {
  const endsAt = c.endsAt ?? t;
  countdown.set({ ...c, running: false, endsAt: null, remainingMs: 0, doneAt: endsAt });
  // finished while the page was closed: say when
  const late = t - endsAt > 5000;
  notify('Timer done', {
    body: late ? `The ${formatLength(c.durationMs)} countdown ended at ${formatAt(endsAt)}.` : `${formatLength(c.durationMs)} is up.`,
    tone: 'success',
    sound: true,
    system: true,
    durationMs: 10_000,
  });
}

/* --------------------------------------------------------------- ticking */

const clock = writable(Date.now());
/** Wall time, updated four times a second while a stopwatch or countdown runs. */
export const now: Readable<number> = { subscribe: clock.subscribe };

let interval: ReturnType<typeof setInterval> | undefined;
let finishTimer: ReturnType<typeof setTimeout> | undefined;

function anyRunning() {
  return get(stopwatch).running || get(countdown).running;
}

function tick() {
  const t = Date.now();
  clock.set(t);
  const c = get(countdown);
  if (c.running && c.endsAt !== null && c.endsAt <= t) finish(c, t);
  renderStatus();
  if (!anyRunning() && interval) {
    clearInterval(interval);
    interval = undefined;
  }
}

/**
 * A one-shot timeout aimed at the end of the countdown. Background tabs
 * throttle repeating timers hard, but a single timeout still fires within
 * about a second, so the alarm is on time even when the tab is hidden.
 */
function scheduleFinish() {
  if (finishTimer) clearTimeout(finishTimer);
  finishTimer = undefined;
  const c = get(countdown);
  if (c.running && c.endsAt !== null) finishTimer = setTimeout(tick, Math.max(0, c.endsAt - Date.now()) + 5);
}

function ensureTicking() {
  if (!interval) interval = setInterval(tick, 250);
  tick();
}

/* ------------------------------------------------------------ status bar */

function renderStatus() {
  const t = Date.now();
  const c = get(countdown);
  const left = remainingMsOf(c, t);
  const cdActive = c.running || (left > 0 && left < c.durationMs);
  setStatus(
    'timer',
    cdActive
      ? {
          text: `${c.running ? '' : 'paused '}timer ${formatClock(left, { roundUp: true })}`,
          tone: c.running ? 'accent' : 'muted',
          order: 11,
          title: c.running ? `Countdown ends at ${formatAt(t + left)} (click to open)` : 'Countdown paused (click to open)',
          onClick: () => openWidget('timer', { mode: 'countdown' }),
        }
      : null,
  );
  const s = get(stopwatch);
  const elapsed = elapsedMs(s, t);
  setStatus(
    'stopwatch',
    s.running || elapsed > 0
      ? {
          text: `${s.running ? '' : 'stopped '}sw ${formatClock(elapsed)}`,
          tone: s.running ? 'accent' : 'muted',
          order: 12,
          title: 'Stopwatch (click to open)',
          onClick: () => openWidget('timer', { mode: 'stopwatch' }),
        }
      : null,
  );
}

// Keep the status bar and the alarm in step with every change, from panes
// or commands. Deferred so the store has settled.
stopwatch.subscribe(() => setTimeout(renderStatus, 0));
countdown.subscribe(() => {
  setTimeout(() => {
    renderStatus();
    scheduleFinish();
  }, 0);
});

// resume after a reload; a countdown that ended while the page was closed fires now
if (anyRunning()) ensureTicking();
