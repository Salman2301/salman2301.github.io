/**
 * Shared model for the iframe music widgets (Spotify): what an item is, how
 * a provider turns text into one, and the small helpers the player component
 * and the terminal commands both use.
 */

/** One playable thing. Stored in pane config, so keep it small and plain. */
export interface MediaItem {
  /** Provider kind: playlist, album, track, episode, show or artist. */
  kind: string;
  id: string;
  /** Display title: a preset name or the oEmbed title. */
  title?: string;
}

export interface Preset {
  /** Short word used by the terminal commands, e.g. "lofi". */
  slug: string;
  name: string;
  /** One-line description shown in the menu. */
  note: string;
  item: MediaItem;
}

export interface MediaSource {
  /** Widget id; also namespaces the recent list. */
  widget: string;
  /** Brand name for titles and messages, e.g. "Spotify". */
  name: string;
  parse(input: string): MediaItem | null;
  /** Validate the shape of an id for this provider (config can come from share links). */
  isValid(item: MediaItem): boolean;
  embedUrl(item: MediaItem): string;
  /** The normal page for the item, for "open in a new tab" and oEmbed. */
  pageUrl(item: MediaItem): string;
  oembedUrl(item: MediaItem): string;
  /** Inline error when the input is not understood. */
  invalidHint: string;
  /** Input placeholder in a roomy pane, and in a small one. */
  placeholder: string;
  shortPlaceholder: string;
}

/** Identity of an item, ignoring its title. */
export function itemKey(item: MediaItem): string {
  return `${item.kind}:${item.id}`;
}

/** Read an item out of untrusted config. */
export function asItem(value: unknown, source: MediaSource): MediaItem | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.kind !== 'string' || typeof v.id !== 'string') return null;
  const item: MediaItem = { kind: v.kind, id: v.id };
  if (typeof v.title === 'string' && v.title) item.title = v.title;
  return source.isValid(item) ? item : null;
}

/** "track 4cOdK2wGLETKBW3PvgPWqT" when there is no title yet. */
export function labelOf(item: MediaItem): string {
  return item.title || `${item.kind} ${item.id}`;
}

/**
 * oEmbed titles often carry emoji. The UI never shows emoji, so strip
 * pictographs and tidy the spacing.
 */
export function cleanTitle(raw: string): string {
  return raw
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu, '')
    .replace(/\s+([|,.:;!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s|·-]+|[\s|·-]+$/g, '')
    .slice(0, 120);
}

const titleCache = new Map<string, string>();

/**
 * Title of an item via the provider's oEmbed endpoint (Spotify allows
 * cross-origin requests). Some items come back without a `title` field, so
 * fall back to the title attribute of the embed html.
 */
export async function fetchTitle(source: MediaSource, item: MediaItem, signal?: AbortSignal): Promise<string> {
  const url = source.oembedUrl(item);
  const cached = titleCache.get(url);
  if (cached) return cached;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`oEmbed ${res.status}`);
  const data = (await res.json()) as { title?: string; html?: string };
  const fromHtml = /title="([^"]+)"/.exec(data.html ?? '')?.[1]?.replace(/^Spotify Embed: /, '');
  const title = cleanTitle(decodeEntities(data.title || fromHtml || ''));
  if (!title) throw new Error('oEmbed: no title');
  titleCache.set(url, title);
  return title;
}

function decodeEntities(s: string): string {
  return s.replace(/&(amp|quot|#39|lt|gt);/g, (_, e: string) => ({ amp: '&', quot: '"', '#39': "'", lt: '<', gt: '>' })[e] ?? '');
}

/**
 * Text typed into the URL bar or after a command: a preset slug or name,
 * else whatever the provider can parse.
 */
export function resolveInput(input: string, source: MediaSource, presets: Preset[]): MediaItem | null {
  const text = input.trim();
  if (!text) return null;
  const needle = text.toLowerCase();
  const preset = presets.find((p) => p.slug === needle || p.name.toLowerCase() === needle);
  if (preset) return { ...preset.item };
  return source.parse(text);
}

export function findPreset(presets: Preset[], item: MediaItem): Preset | undefined {
  const key = itemKey(item);
  return presets.find((p) => itemKey(p.item) === key);
}

/** Accept "open.spotify.com/..." without a scheme. Returns null when it is not a URL. */
export function toUrl(text: string): URL | null {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const u = new URL(withScheme);
    return u.hostname.includes('.') ? u : null;
  } catch {
    return null;
  }
}

/** Pane title "Spotify · lofi beats"; the fallback item's title when the pane has none of its own. */
export function mediaPaneTitle(name: string, value: unknown, fallback: MediaItem): string {
  const item = value === undefined ? fallback : value;
  const title = item && typeof item === 'object' ? (item as Partial<MediaItem>).title : undefined;
  return typeof title === 'string' && title ? `${name} · ${title}` : name;
}
