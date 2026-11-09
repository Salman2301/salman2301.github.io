/**
 * Shared model for the media widgets (youtube, ytmusic, spotify): what an
 * item is, how a provider turns text into one, and the small helpers the
 * player component and the terminal commands both use.
 */

/** One playable thing. Stored in pane config, so keep it small and plain. */
export interface MediaItem {
  /** Provider kind: 'video' | 'playlist' for YouTube; playlist, album, track, ... for Spotify. */
  kind: string;
  id: string;
  /** YouTube: the playlist a video plays inside. */
  list?: string;
  /** Start offset in seconds. */
  start?: number;
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
  /** Brand name for titles and messages, e.g. "YouTube". */
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

/** Identity of an item, ignoring title and start time. */
export function itemKey(item: MediaItem): string {
  return `${item.kind}:${item.id}${item.list ? `:${item.list}` : ''}`;
}

/** Identity plus start time: when this changes the iframe must reload. */
export function playKey(item: MediaItem): string {
  return `${itemKey(item)}@${item.start ?? 0}`;
}

/** Read an item out of untrusted config. */
export function asItem(value: unknown, source: MediaSource): MediaItem | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.kind !== 'string' || typeof v.id !== 'string') return null;
  const item: MediaItem = { kind: v.kind, id: v.id };
  if (typeof v.list === 'string' && v.list) item.list = v.list;
  if (typeof v.start === 'number' && v.start > 0) item.start = Math.floor(v.start);
  if (typeof v.title === 'string' && v.title) item.title = v.title;
  return source.isValid(item) ? item : null;
}

/** "video jfKfPfyJRdk" when there is no title yet. */
export function labelOf(item: MediaItem): string {
  return item.title || `${item.kind} ${item.id}`;
}

/**
 * oEmbed titles often carry emoji ("lofi hip hop radio 📚 beats to ...").
 * The UI never shows emoji, so strip pictographs and tidy the spacing.
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
 * Title of an item via the provider's oEmbed endpoint (both YouTube and
 * Spotify allow cross-origin requests). Live streams come back without a
 * `title` field, so fall back to the title attribute of the embed html.
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

/**
 * Autoplay only once the visitor has interacted with the page, so a reload
 * never starts music on its own, but picking something plays it at once.
 */
export function canAutoplay(): boolean {
  const nav = navigator as Navigator & { userActivation?: { hasBeenActive: boolean } };
  return !!nav.userActivation?.hasBeenActive;
}

/** Accept "youtube.com/..." without a scheme. Returns null when it is not a URL. */
export function toUrl(text: string): URL | null {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const u = new URL(withScheme);
    return u.hostname.includes('.') ? u : null;
  } catch {
    return null;
  }
}

/** Pane title "YouTube · lofi hip hop radio". */
export function mediaPaneTitle(name: string, value: unknown, fallback: MediaItem): string {
  const item = value && typeof value === 'object' ? (value as MediaItem) : fallback;
  const title = typeof item.title === 'string' ? item.title : '';
  return title ? `${name} · ${title}` : name;
}
