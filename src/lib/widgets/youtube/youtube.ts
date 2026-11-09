import { canAutoplay, toUrl, type MediaItem, type MediaSource } from './media';

/**
 * YouTube link parsing and embedding, shared by the youtube and ytmusic
 * widgets. Everything plays through the privacy-enhanced
 * youtube-nocookie.com player.
 */

const VIDEO_ID = /^[\w-]{11}$/;
const LIST_ID = /^[\w-]{10,64}$/;
/** Bare playlist ids: PL (user), OLAK5uy (album), RDCLAK5uy (curated), UU (uploads), FL/LL. */
const BARE_LIST = /^(?:PL|OLAK5uy_|RDCLAK5uy_|UU|FL|LL)[\w-]{8,62}$/;
const HOSTS = new Set(['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'youtu.be', 'gaming.youtube.com']);

/** "90", "90s", "1m30s", "1h2m3s", "01:30" -> seconds. 0 when not a time. */
export function parseTime(raw: string | null | undefined): number {
  if (!raw) return 0;
  const t = raw.trim();
  if (/^\d+s?$/.test(t)) return parseInt(t, 10);
  const hms = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  if (hms && (hms[1] || hms[2] || hms[3])) return +(hms[1] ?? 0) * 3600 + +(hms[2] ?? 0) * 60 + +(hms[3] ?? 0);
  const clock = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(t);
  if (clock) return +(clock[1] ?? 0) * 3600 + +clock[2] * 60 + +clock[3];
  return 0;
}

/**
 * Radio mixes (RD + a video id) cannot play in the embedded player, so a
 * video inside one plays on its own. Curated YouTube Music lists (RDCLAK5uy)
 * are real playlists and are kept.
 */
function usableList(list: string | null): string | undefined {
  if (!list || !LIST_ID.test(list)) return undefined;
  if (list.startsWith('RD') && !list.startsWith('RDCLAK5uy')) return undefined;
  return list;
}

/** The video a radio mix was seeded from: RDAMVM<id>, RDMM<id> or RD<id>. */
function mixSeed(list: string | null): string | undefined {
  const m = list ? /^RD(?:AMVM|MM)?([\w-]{11})$/.exec(list) : null;
  return m?.[1];
}

/**
 * Embed paths that happen to be 11 characters long but are not video ids:
 * embed/videoseries?list=... is a playlist, and embed/live_stream?channel=...
 * (a channel's current stream) showed "video unavailable" when tried, so it
 * gets the inline error instead of a broken player.
 */
const NOT_VIDEOS = new Set(['videoseries', 'live_stream']);

function videoFromPath(path: string): string | undefined {
  const m = /^\/(?:embed|shorts|live|v|e|watch)\/([\w-]{11})(?:[/?#]|$)/.exec(path);
  return m && !NOT_VIDEOS.has(m[1]) ? m[1] : undefined;
}

/** Any YouTube or YouTube Music link, a bare 11-character video id or a bare playlist id. */
export function parseYouTube(input: string): MediaItem | null {
  const text = input.trim();
  if (VIDEO_ID.test(text) && !NOT_VIDEOS.has(text)) return { kind: 'video', id: text };
  if (BARE_LIST.test(text)) return { kind: 'playlist', id: text };
  const url = toUrl(text);
  if (!url) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!HOSTS.has(host)) return null;

  const q = url.searchParams;
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const start = parseTime(q.get('t') ?? q.get('start') ?? hash.get('t'));
  const rawList = q.get('list');
  let video: string | undefined;

  if (host === 'youtu.be') video = /^\/([\w-]{11})(?:[/?#]|$)/.exec(url.pathname)?.[1];
  else video = (VIDEO_ID.test(q.get('v') ?? '') ? q.get('v')! : undefined) ?? videoFromPath(url.pathname);

  // /channel/UC... -> that channel's uploads playlist (UU...)
  const channel = /^\/channel\/UC([\w-]{22})(?:[/?#]|$)/.exec(url.pathname)?.[1];
  if (!video && channel) return { kind: 'playlist', id: `UU${channel}` };

  video = video ?? mixSeed(rawList);
  const list = usableList(rawList);
  if (video) {
    const item: MediaItem = { kind: 'video', id: video };
    if (list) item.list = list;
    if (start) item.start = start;
    return item;
  }
  return list ? { kind: 'playlist', id: list } : null;
}

export function isValidYouTube(item: MediaItem): boolean {
  if (item.kind === 'video') return VIDEO_ID.test(item.id) && !NOT_VIDEOS.has(item.id) && (!item.list || LIST_ID.test(item.list));
  return item.kind === 'playlist' && LIST_ID.test(item.id);
}

export function youtubeEmbedUrl(item: MediaItem): string {
  const params = new URLSearchParams();
  let path = item.id;
  if (item.kind === 'playlist') {
    path = 'videoseries';
    params.set('list', item.id);
  } else if (item.list) params.set('list', item.list);
  if (item.start) params.set('start', String(item.start));
  if (canAutoplay()) params.set('autoplay', '1');
  params.set('rel', '0');
  params.set('playsinline', '1');
  return `https://www.youtube-nocookie.com/embed/${path}?${params}`;
}

export function youtubePageUrl(item: MediaItem): string {
  if (item.kind === 'playlist') return `https://www.youtube.com/playlist?list=${item.id}`;
  const params = new URLSearchParams({ v: item.id });
  if (item.list) params.set('list', item.list);
  if (item.start) params.set('t', `${item.start}s`);
  return `https://www.youtube.com/watch?${params}`;
}

/** A YouTube media source; ytmusic reuses it with its own widget id and wording. */
export function youtubeSource(overrides: Partial<MediaSource> & Pick<MediaSource, 'widget' | 'name'>): MediaSource {
  return {
    parse: parseYouTube,
    isValid: isValidYouTube,
    embedUrl: youtubeEmbedUrl,
    pageUrl: youtubePageUrl,
    oembedUrl: (item) => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(youtubePageUrl({ ...item, start: undefined }))}`,
    invalidHint: 'Not a YouTube link. Paste a watch, youtu.be, shorts, live or playlist link, or an 11-character video id.',
    placeholder: 'paste a YouTube link, video id or playlist',
    shortPlaceholder: 'link or video id',
    ...overrides,
  };
}

export const YOUTUBE = youtubeSource({ widget: 'youtube', name: 'YouTube' });
