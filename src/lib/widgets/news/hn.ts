/** Hacker News via the official Firebase API (CORS enabled, no key needed). */
export interface Story {
  id: number;
  title: string;
  url?: string;
  score: number;
  by: string;
  time: number;
  descendants?: number;
}

export type Feed = 'top' | 'new' | 'best' | 'ask' | 'show';
export const FEEDS: Feed[] = ['top', 'new', 'best', 'ask', 'show'];

const API = 'https://hacker-news.firebaseio.com/v0';
const cache = new Map<string, { at: number; stories: Story[] }>();

export async function fetchStories(feed: Feed = 'top', limit = 30, signal?: AbortSignal, fresh = false): Promise<Story[]> {
  const key = `${feed}:${limit}`;
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < 5 * 60_000) return hit.stories;
  const res = await fetch(`${API}/${feed}stories.json`, { signal });
  if (!res.ok) throw new Error(`Hacker News returned ${res.status}`);
  const ids = ((await res.json()) as number[]).slice(0, limit);
  const items = await Promise.all(
    ids.map((id) =>
      fetch(`${API}/item/${id}.json`, { signal })
        .then((r) => (r.ok ? (r.json() as Promise<Story | null>) : null))
        .catch(() => null),
    ),
  );
  const stories = items.filter((s): s is Story => !!s && !!s.title);
  cache.set(key, { at: Date.now(), stories });
  return stories;
}

export const itemUrl = (id: number) => `https://news.ycombinator.com/item?id=${id}`;

export function domain(url?: string): string {
  if (!url) return 'news.ycombinator.com';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function ago(unix: number): string {
  const m = Math.round((Date.now() / 1000 - unix) / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}

/** Ranges for the "top" feed. "live" is the current front page. */
export type Period = 'day' | 'month' | 'year' | 'live';
export const PERIODS: Period[] = ['day', 'month', 'year', 'live'];
const PERIOD_SECONDS: Record<Exclude<Period, 'live'>, number> = {
  day: 86_400,
  month: 30 * 86_400,
  year: 365 * 86_400,
};

const SEARCH = 'https://hn.algolia.com/api/v1/search';

interface AlgoliaHit {
  objectID: string;
  title: string | null;
  url?: string | null;
  points: number | null;
  author: string;
  created_at_i: number;
  num_comments: number | null;
}

/**
 * Most popular stories posted within the period (Algolia's HN search, ranked
 * by points). The live front page is fetchStories('top').
 */
export async function fetchTopSince(period: Exclude<Period, 'live'>, limit = 30, signal?: AbortSignal, fresh = false): Promise<Story[]> {
  const key = `top-${period}:${limit}`;
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < 5 * 60_000) return hit.stories;
  const since = Math.floor(Date.now() / 1000) - PERIOD_SECONDS[period];
  const url = `${SEARCH}?tags=story&numericFilters=${encodeURIComponent(`created_at_i>${since}`)}&hitsPerPage=${limit}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Hacker News search returned ${res.status}`);
  const data = (await res.json()) as { hits: AlgoliaHit[] };
  const stories: Story[] = data.hits
    .filter((h) => h.title)
    .map((h) => ({
      id: Number(h.objectID),
      title: h.title as string,
      url: h.url ?? undefined,
      score: h.points ?? 0,
      by: h.author,
      time: h.created_at_i,
      descendants: h.num_comments ?? 0,
    }));
  cache.set(key, { at: Date.now(), stories });
  return stories;
}
