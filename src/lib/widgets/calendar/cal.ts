import { parseDate, ymd } from '../../core/dates';

/** Zoom levels, from the widest to the closest. Pinching out moves right. */
export const LEVELS = ['year', 'month', 'week', 'day'] as const;
export type Level = (typeof LEVELS)[number];

export const WEEKDAYS_SHORT = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export const toDate = (key: string) => parseDate(key) ?? new Date();

export function addDays(key: string, n: number): string {
  const d = toDate(key);
  return ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

/** Add months, keeping the day where it exists (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(key: string, n: number): string {
  const d = toDate(key);
  const last = new Date(d.getFullYear(), d.getMonth() + n + 1, 0).getDate();
  return ymd(new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), last)));
}

/** The Monday on or before the date. */
export function startOfWeek(key: string): string {
  const d = toDate(key);
  return addDays(key, -((d.getDay() + 6) % 7));
}

export function weekDays(key: string): string[] {
  const start = startOfWeek(key);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export interface GridDay {
  key: string;
  day: number;
  inMonth: boolean;
}

/** Six weeks of days covering a month, Monday first. */
export function monthGrid(year: number, month: number): GridDay[] {
  const first = ymd(new Date(year, month, 1));
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => {
    const key = addDays(start, i);
    const d = toDate(key);
    return { key, day: d.getDate(), inMonth: d.getMonth() === month };
  });
}

/** Move by one period of the level: a year, a month, a week or a day. */
export function step(level: Level, key: string, dir: number): string {
  if (level === 'year') return addMonths(key, 12 * dir);
  if (level === 'month') return addMonths(key, dir);
  if (level === 'week') return addDays(key, 7 * dir);
  return addDays(key, dir);
}

/** Identity of the period on screen, so changing it can animate. */
export function periodKey(level: Level, key: string): string {
  if (level === 'year') return key.slice(0, 4);
  if (level === 'month') return key.slice(0, 7);
  if (level === 'week') return startOfWeek(key);
  return key;
}

export function title(level: Level, key: string): string {
  const d = toDate(key);
  if (level === 'year') return String(d.getFullYear());
  if (level === 'month') return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  if (level === 'day') return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const days = weekDays(key);
  const a = toDate(days[0]);
  const b = toDate(days[6]);
  const left = a.toLocaleDateString(undefined, a.getMonth() === b.getMonth() ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
  return `${left} – ${b.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
