/**
 * Date words for @ in notes and tasks: now, today, tomorrow (tmrw), yesterday,
 * next week and the weekdays. Dates are "YYYY-MM-DD", or "YYYY-MM-DD HH:MM"
 * with a time, the same shape as a task's due date.
 */

const pad = (n: number) => String(n).padStart(2, '0');

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function ymdhm(d: Date): string {
  return `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Canonical words, in the order the picker lists them, and their short forms. */
const WORDS: { word: string; aliases: string[] }[] = [
  { word: 'time', aliases: [] },
  { word: 'date', aliases: [] },
  { word: 'now', aliases: [] },
  { word: 'today', aliases: ['tod'] },
  { word: 'tomorrow', aliases: ['tmrw', 'tmr', 'tmw', 'tom'] },
  { word: 'yesterday', aliases: ['yday', 'yest'] },
  { word: 'nextweek', aliases: ['next-week'] },
  ...['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((w) => ({ word: w, aliases: [w.slice(0, 3)] })),
];

function canonical(word: string): string | null {
  const w = word.toLowerCase();
  for (const e of WORDS) if (e.word === w || e.aliases.includes(w)) return e.word;
  return null;
}

/**
 * The date a word means, counted from `now`. Weekdays mean the next one
 * coming (on a Monday, "monday" is a week away). A plain YYYY-MM-DD passes
 * through. Null when the word is not a date.
 */
export function resolveDateWord(word: string, now = new Date()): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(word)) return word;
  const w = canonical(word);
  if (!w) return null;
  if (w === 'now' || w === 'time') return ymdhm(now);
  if (w === 'today' || w === 'date') return ymd(now);
  if (w === 'tomorrow') return ymd(addDays(now, 1));
  if (w === 'yesterday') return ymd(addDays(now, -1));
  if (w === 'nextweek') return ymd(addDays(now, 7));
  const i = WEEKDAYS.indexOf(w);
  const ahead = (i - now.getDay() + 7) % 7 || 7;
  return ymd(addDays(now, ahead));
}

/** Date words that start with what was typed after @, with the date each means. */
export function dateSuggestions(query: string, now = new Date()): { word: string; value: string }[] {
  const q = query.toLowerCase();
  if (!q) return [];
  return WORDS.filter((e) => e.word.startsWith(q) || e.aliases.some((a) => a.startsWith(q))).map((e) => ({
    word: e.word,
    value: resolveDateWord(e.word, now)!,
  }));
}

/** "2026-11-10" or "2026-11-10 14:30" as a Date (a date alone is midnight). */
export function parseDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(value);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
}

/** "Tue 10 Nov", "Tue 10 Nov 14:30", with the year when it is not this year. */
export function formatDate(value: string, now = new Date()): string {
  const d = parseDate(value);
  if (!d) return value;
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  const time = /[ T]\d{2}:\d{2}$/.test(value) ? ` ${value.slice(-5)}` : '';
  return d.toLocaleDateString(undefined, opts) + time;
}

/** "today", "tomorrow", "yesterday" (plus the time), else formatDate. */
export function friendlyDate(value: string, now = new Date()): string {
  const day = value.slice(0, 10);
  const time = value.length > 10 ? ` ${value.slice(-5)}` : '';
  if (day === ymd(now)) return `today${time}`;
  if (day === ymd(addDays(now, 1))) return `tomorrow${time}`;
  if (day === ymd(addDays(now, -1))) return `yesterday${time}`;
  return formatDate(value, now);
}

/** "today", "tomorrow", "in 3 days", "2 weeks ago", ... for a date's day. */
export function relativeDay(value: string, now = new Date()): string {
  const d = parseDate(value.slice(0, 10));
  if (!d) return '';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  const n = Math.abs(days);
  const span = n < 14 ? `${n} days` : n < 60 ? `${Math.round(n / 7)} weeks` : n < 730 ? `${Math.round(n / 30)} months` : `${Math.round(n / 365)} years`;
  return days > 0 ? `in ${span}` : `${span} ago`;
}
