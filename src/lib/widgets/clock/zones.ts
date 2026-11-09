/**
 * Time zone helpers for the world clock. All maths goes through Intl, so
 * daylight saving time is whatever the browser's time zone data says.
 */

/** Used for the datalist when Intl.supportedValuesOf is not available. */
const COMMON_ZONES = [
  'UTC',
  'Pacific/Honolulu',
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Vancouver',
  'America/Denver',
  'America/Chicago',
  'America/Mexico_City',
  'America/New_York',
  'America/Toronto',
  'America/Bogota',
  'America/Lima',
  'America/Santiago',
  'America/Sao_Paulo',
  'America/Argentina/Buenos_Aires',
  'Atlantic/Reykjavik',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Lisbon',
  'Europe/Madrid',
  'Europe/Paris',
  'Europe/Amsterdam',
  'Europe/Berlin',
  'Europe/Zurich',
  'Europe/Rome',
  'Europe/Stockholm',
  'Europe/Warsaw',
  'Europe/Athens',
  'Europe/Helsinki',
  'Europe/Kyiv',
  'Europe/Istanbul',
  'Europe/Moscow',
  'Africa/Lagos',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Nairobi',
  'Asia/Jerusalem',
  'Asia/Riyadh',
  'Asia/Tehran',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Kathmandu',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Singapore',
  'Asia/Kuala_Lumpur',
  'Asia/Manila',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Taipei',
  'Asia/Seoul',
  'Asia/Tokyo',
  'Australia/Perth',
  'Australia/Adelaide',
  'Australia/Brisbane',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland',
];

/** Cities people type that are not the name of their zone. */
const CITY_ALIASES: Record<string, string> = {
  sf: 'America/Los_Angeles',
  'san francisco': 'America/Los_Angeles',
  seattle: 'America/Los_Angeles',
  la: 'America/Los_Angeles',
  nyc: 'America/New_York',
  boston: 'America/New_York',
  miami: 'America/New_York',
  washington: 'America/New_York',
  austin: 'America/Chicago',
  dallas: 'America/Chicago',
  'buenos aires': 'America/Argentina/Buenos_Aires',
  'rio de janeiro': 'America/Sao_Paulo',
  munich: 'Europe/Berlin',
  frankfurt: 'Europe/Berlin',
  barcelona: 'Europe/Madrid',
  milan: 'Europe/Rome',
  kiev: 'Europe/Kyiv',
  'st petersburg': 'Europe/Moscow',
  mumbai: 'Asia/Kolkata',
  delhi: 'Asia/Kolkata',
  'new delhi': 'Asia/Kolkata',
  bangalore: 'Asia/Kolkata',
  bengaluru: 'Asia/Kolkata',
  chennai: 'Asia/Kolkata',
  beijing: 'Asia/Shanghai',
  shenzhen: 'Asia/Shanghai',
  'tel aviv': 'Asia/Jerusalem',
  'abu dhabi': 'Asia/Dubai',
  osaka: 'Asia/Tokyo',
  'ho chi minh': 'Asia/Ho_Chi_Minh',
  saigon: 'Asia/Ho_Chi_Minh',
  wellington: 'Pacific/Auckland',
  gmt: 'UTC',
  utc: 'UTC',
  zulu: 'UTC',
};

/**
 * Chrome reports some zones by their old names (Asia/Calcutta). Show and
 * store the current IANA names instead; every engine accepts both.
 */
const RENAMED: Record<string, string> = {
  'Africa/Asmera': 'Africa/Asmara',
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
  'America/Catamarca': 'America/Argentina/Catamarca',
  'America/Coral_Harbour': 'America/Atikokan',
  'America/Cordoba': 'America/Argentina/Cordoba',
  'America/Godthab': 'America/Nuuk',
  'America/Indianapolis': 'America/Indiana/Indianapolis',
  'America/Jujuy': 'America/Argentina/Jujuy',
  'America/Louisville': 'America/Kentucky/Louisville',
  'America/Mendoza': 'America/Argentina/Mendoza',
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
  'Europe/Kiev': 'Europe/Kyiv',
  'Pacific/Enderbury': 'Pacific/Kanton',
  'Pacific/Ponape': 'Pacific/Pohnpei',
  'Pacific/Truk': 'Pacific/Chuuk',
};

function resolvedName(zone: string): string | null {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/** The current name of a zone, when this engine accepts it. */
function modern(zone: string): string {
  const next = RENAMED[zone];
  return next && resolvedName(next) ? next : zone;
}

let zoneList: string[] | null = null;

/** Every zone the browser knows (or a built-in list of common ones), for suggestions. */
export function allZones(): string[] {
  if (zoneList) return zoneList;
  let list: string[] = [];
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    if (supported) list = supported('timeZone').map(modern);
  } catch {
    /* older engines */
  }
  if (!list.length) list = COMMON_ZONES.filter((z) => resolvedName(z));
  zoneList = list.includes('UTC') ? list : ['UTC', ...list];
  return zoneList;
}

let spellings: Map<string, string> | null = null;
const canonical = new Map<string, string | null>();

/** The canonical spelling of a zone ("asia/kolkata" -> "Asia/Kolkata"), or null if unknown. */
export function canonicalZone(zone: string): string | null {
  if (canonical.has(zone)) return canonical.get(zone) ?? null;
  if (!spellings) spellings = new Map([...COMMON_ZONES, ...allZones()].map((z) => [z.toLowerCase(), z]));
  const known = spellings.get(zone.toLowerCase());
  const resolved = resolvedName(known ?? zone);
  const out = resolved ? known ?? modern(resolved) : null;
  canonical.set(zone, out);
  return out;
}

export const isValidZone = (zone: string) => canonicalZone(zone) !== null;

const simplify = (s: string) => s.toLowerCase().replace(/[_\s.-]+/g, ' ').trim();

/**
 * Turn what the user typed into a zone: an IANA name ("Asia/Tokyo"), a city
 * ("tokyo", "new york", "bangalore") or UTC. Returns null when nothing matches.
 */
export function resolveZone(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const alias = CITY_ALIASES[simplify(raw)];
  if (alias) return canonicalZone(alias);
  if (raw.includes('/')) {
    const direct = canonicalZone(raw.replace(/\s+/g, '_'));
    if (direct) return direct;
  }
  const needle = simplify(raw);
  const zones = allZones();
  const city = (z: string) => simplify(z.split('/').pop() ?? z);
  const match =
    zones.find((z) => city(z) === needle) ??
    zones.find((z) => simplify(z) === needle) ??
    zones.find((z) => city(z).startsWith(needle)) ??
    zones.find((z) => simplify(z).includes(needle));
  return match ? canonicalZone(match) : null;
}

/** "America/Argentina/Buenos_Aires" -> "Buenos Aires". */
export function cityName(zone: string): string {
  return (zone.split('/').pop() ?? zone).replace(/_/g, ' ');
}

export function localZone(): string {
  try {
    return modern(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  } catch {
    return 'UTC';
  }
}

/** True when this locale writes times with AM/PM. */
export function prefers12h(): boolean {
  try {
    return !!new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------ wall time */

export interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday. */
  weekday: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function partsFormatter(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      weekday: 'short',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(zone, f);
  }
  return f;
}

/** The wall clock time in `zone` at `date`. */
export function wallTime(zone: string, date: Date): WallTime {
  const out: WallTime = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0, weekday: 0 };
  for (const p of partsFormatter(zone).formatToParts(date)) {
    if (p.type === 'weekday') out.weekday = Math.max(0, WEEKDAYS.indexOf(p.value));
    else if (p.type in out) out[p.type as keyof WallTime] = Number(p.value);
  }
  // some engines print midnight as 24 even with h23
  if (out.hour === 24) out.hour = 0;
  return out;
}

/** Minutes ahead of UTC in `zone` at `date` (Tokyo: 540). */
export function utcOffset(zone: string, date: Date): number {
  const w = wallTime(zone, date);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

/** Calendar days `zone` is ahead of the local date: -1, 0 or 1 (rarely 2). */
export function dayOffset(zone: string, date: Date): number {
  const w = wallTime(zone, date);
  const there = Date.UTC(w.year, w.month - 1, w.day);
  const here = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((there - here) / 86_400_000);
}

export const isDaytime = (hour: number) => hour >= 6 && hour < 18;

/* ----------------------------------------------------------- formatting */

const pad = (n: number) => String(n).padStart(2, '0');

/** "14:05" or "2:05 PM". */
export function formatHM(hour: number, minute: number, hour12: boolean): string {
  if (!hour12) return `${pad(hour)}:${pad(minute)}`;
  return `${hour % 12 || 12}:${pad(minute)} ${hour < 12 ? 'AM' : 'PM'}`;
}

const sign = (n: number) => (n > 0 ? '+' : '−');

/** "UTC+9", "UTC−3:30", "UTC". */
export function formatUtcOffset(mins: number): string {
  if (!mins) return 'UTC';
  const abs = Math.abs(mins);
  const m = abs % 60;
  return `UTC${sign(mins)}${Math.floor(abs / 60)}${m ? `:${pad(m)}` : ''}`;
}

/** Difference to local time: "+8h", "−10h 30m", "same time". */
export function formatRelativeOffset(mins: number): string {
  if (!mins) return 'same time';
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign(mins)}${[h && `${h}h`, m && `${m}m`].filter(Boolean).join(' ')}`;
}

/** "+1 day", "−1 day", "" for the same day. */
export function formatDayOffset(days: number): string {
  if (!days) return '';
  return `${sign(days)}${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`;
}

/** Everything a world clock row shows, for a zone at a moment. */
export interface ZoneRow {
  zone: string;
  city: string;
  time: string;
  weekday: string;
  /** Calendar days ahead of the local date. */
  days: number;
  /** The same as text: "+1 day", or "" for today. */
  day: string;
  relative: string;
  utc: string;
  daytime: boolean;
}

export function describeZone(zone: string, date: Date, hour12: boolean): ZoneRow {
  const w = wallTime(zone, date);
  const offset = utcOffset(zone, date);
  const days = dayOffset(zone, date);
  return {
    zone,
    city: cityName(zone),
    time: formatHM(w.hour, w.minute, hour12),
    weekday: WEEKDAYS[w.weekday],
    days,
    day: formatDayOffset(days),
    relative: formatRelativeOffset(offset + date.getTimezoneOffset()),
    utc: formatUtcOffset(offset),
    daytime: isDaytime(w.hour),
  };
}
