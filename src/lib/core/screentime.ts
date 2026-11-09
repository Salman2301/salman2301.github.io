import { get } from 'svelte/store';
import { ymd } from './dates';
import { persisted } from './storage';
import { leaves, workspace } from './workspace';

/**
 * Screen time: how long the site is actually used, per day, per widget (the
 * focused pane), per space (the tab's space) and per hour. Time counts only
 * while the page is visible and there was a key, click, scroll or pointer
 * move in the last two minutes. Stored in this browser only; 90 days kept.
 */

export interface DayUse {
  /** Seconds in total. */
  total: number;
  /** Seconds per widget id. */
  widgets: Record<string, number>;
  /** Seconds per space id ('all' for tabs not pinned to a space). */
  spaces: Record<string, number>;
  /** Seconds in each hour of the day, 0-23. */
  hours: number[];
}

export const screenTime = persisted<Record<string, DayUse>>('screentime:days', {}, 1000);

const IDLE_MS = 2 * 60_000;
const TICK_MS = 15_000;
const KEEP_DAYS = 90;

let lastActivity = Date.now();
let lastTick = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;

const emptyDay = (): DayUse => ({ total: 0, widgets: {}, spaces: {}, hours: Array(24).fill(0) });

/** Credit the time since the last tick to what is on screen now. */
function tick() {
  const now = Date.now();
  // never more than one tick's worth: a sleeping laptop is not screen time
  const seconds = Math.min(now - lastTick, TICK_MS * 2) / 1000;
  lastTick = now;
  if (document.hidden || now - lastActivity > IDLE_MS || seconds <= 0) return;

  const s = get(workspace);
  const focused = leaves(s.root).find((l) => l.id === s.focused) ?? leaves(s.root)[0];
  const widget = focused?.widget ?? 'terminal';
  const space = s.tabs.find((t) => t.id === s.active)?.space ?? 'all';
  const date = new Date(now);
  const key = ymd(date);

  screenTime.update((days) => {
    const day = days[key] ? { ...days[key], widgets: { ...days[key].widgets }, spaces: { ...days[key].spaces }, hours: [...days[key].hours] } : emptyDay();
    day.total += seconds;
    day.widgets[widget] = (day.widgets[widget] ?? 0) + seconds;
    day.spaces[space] = (day.spaces[space] ?? 0) + seconds;
    day.hours[date.getHours()] += seconds;
    const next = { ...days, [key]: day };
    const keys = Object.keys(next).sort();
    for (const old of keys.slice(0, Math.max(0, keys.length - KEEP_DAYS))) delete next[old];
    return next;
  });
}

function onActivity() {
  lastActivity = Date.now();
}

function onVisibility() {
  // Coming back: start counting from now, not from when the tab was hidden.
  if (!document.hidden) {
    lastTick = Date.now();
    lastActivity = Date.now();
  } else tick();
}

/** Start counting. Safe to call more than once. */
export function startScreenTime() {
  if (timer) return;
  for (const ev of ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart']) window.addEventListener(ev, onActivity, { passive: true, capture: true });
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', tick);
  lastTick = Date.now();
  timer = setInterval(tick, TICK_MS);
}

/** "2h 05m", "14m", "40s". */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/** The last `n` days, oldest first, with empty days filled in. */
export function lastDays(days: Record<string, DayUse>, n: number, today = new Date()): { key: string; day: DayUse }[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (n - 1 - i));
    const key = ymd(d);
    return { key, day: days[key] ?? emptyDay() };
  });
}
