import { get } from 'svelte/store';
import { themes, themeStore } from '../../core/theme';
import { toUrl, type MediaItem, type MediaSource } from '../media/media';

/** Spotify link parsing and embedding (open.spotify.com/embed/...). */

export const SPOTIFY_KINDS = ['playlist', 'album', 'track', 'episode', 'show', 'artist'] as const;
const KINDS = new Set<string>(SPOTIFY_KINDS);
const ID = /^[A-Za-z0-9]{22}$/;
const HOSTS = new Set(['open.spotify.com', 'play.spotify.com', 'embed.spotify.com']);

/** First "<kind>/<id>" (or "<kind>:<id>") pair in a list of path segments. */
function findPair(parts: string[]): MediaItem | null {
  for (let i = 0; i < parts.length - 1; i++) {
    const kind = parts[i].toLowerCase();
    if (KINDS.has(kind) && ID.test(parts[i + 1])) return { kind, id: parts[i + 1] };
  }
  return null;
}

/**
 * open.spotify.com links (with /intl-xx/, /embed/ or old /user/x/ segments
 * and any query string) and spotify:kind:id URIs.
 */
export function parseSpotify(input: string): MediaItem | null {
  const text = input.trim();
  if (/^spotify:/i.test(text)) return findPair(text.split(':').slice(1));
  const url = toUrl(text);
  if (!url || !HOSTS.has(url.hostname.toLowerCase())) return null;
  return findPair(url.pathname.split('/').filter(Boolean));
}

export function isValidSpotify(item: MediaItem): boolean {
  return KINDS.has(item.kind) && ID.test(item.id);
}

export function darkTheme(): boolean {
  const hex = themes[get(themeStore)]?.[0] ?? '#000000';
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 <= 150;
}

/**
 * Spotify's embed has three layouts: an 80px strip, a 152px card and the
 * full player with a track list from 352px up. Heights in between only add
 * blank space under the smaller layout, so pick the biggest that fits, with
 * a little air above and below when that does not cost a size step. The
 * card cuts off its play button when narrow, where the strip still fits.
 */
export function fitSpotify(width: number, height: number): number {
  const airy = height - 12;
  if (airy >= 352) return airy;
  if (height >= 352) return height;
  if (height >= 152 && width >= 280) return 152;
  return Math.min(80, height);
}

export const SPOTIFY: MediaSource = {
  widget: 'spotify',
  name: 'Spotify',
  parse: parseSpotify,
  isValid: isValidSpotify,
  // theme=0 is Spotify's dark card; light themes keep its album-colour card.
  embedUrl: (item) => `https://open.spotify.com/embed/${item.kind}/${item.id}?utm_source=generator${darkTheme() ? '&theme=0' : ''}`,
  pageUrl: (item) => `https://open.spotify.com/${item.kind}/${item.id}`,
  oembedUrl: (item) => `https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/${item.kind}/${item.id}`)}`,
  invalidHint: 'Not a Spotify link. Paste an open.spotify.com playlist, album, track, episode, show or artist link, or a spotify: URI.',
  placeholder: 'paste a Spotify link or spotify: URI',
  shortPlaceholder: 'Spotify link',
};
