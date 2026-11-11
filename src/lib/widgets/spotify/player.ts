import { get, writable } from 'svelte/store';
import { persisted } from '../../core/storage';
import { asItem, cleanTitle, itemKey, type MediaItem } from '../media/media';
import { recentFor, recordPlay } from '../media/recent';
import { SPOTIFY_DEFAULT, SPOTIFY_PRESETS } from './presets';
import { darkTheme, SPOTIFY } from './spotify';

/**
 * The one Spotify player on the page. Like the radio, it lives outside any
 * pane, so the music keeps going when you switch tabs, close the pane or
 * change template. The Spotify pane, the status bar and the `spotify` command
 * all drive it.
 *
 * Spotify only plays inside its own embedded frame. That frame is created
 * once, kept out of sight, and driven through Spotify's iFrame API (play,
 * pause, seek, load), so the controls can be drawn in the theme. A pane can
 * ask to show the real frame (for the track list) with `attachSpotify`: the
 * frame is then laid over that spot, never moved in the document, because
 * moving it would restart it.
 *
 * What the API does not offer: next / previous track, volume, and the list
 * of tracks. Those stay inside Spotify's frame.
 */

export type SpotifyStatus = 'off' | 'loading' | 'ready' | 'playing' | 'paused' | 'error';

export interface SpotifyState {
  /** What is loaded: a playlist, album, track, show... */
  item: MediaItem;
  status: SpotifyStatus;
  buffering: boolean;
  /** Milliseconds into the current track, and its length. */
  position: number;
  duration: number;
  /** The track playing inside a playlist or album, once known. */
  track: string;
  /** Cover image of the item (or of the playing track). */
  art: string;
  error: string;
}

/** What survives a reload: the last thing played. Never auto-plays. */
export const spotifyPrefs = persisted<{ item: MediaItem }>('spotify', { item: SPOTIFY_DEFAULT });

/** Playlists (or albums, shows...) you starred, in the order you starred them. */
export const spotifyFavs = persisted<MediaItem[]>('spotify:favs', []);

/** The list the player shows and that next / previous step through. */
export const spotifyList = persisted<string>('spotify:list', 'presets');

export const SPOTIFY_LISTS: { id: string; label: string }[] = [
  { id: 'favs', label: 'favourites' },
  { id: 'presets', label: 'presets' },
  { id: 'recent', label: 'recent' },
];

const recent = recentFor('spotify');

export const spotifyState = writable<SpotifyState>({
  item: asItem(get(spotifyPrefs).item, SPOTIFY) ?? SPOTIFY_DEFAULT,
  status: 'off',
  buffering: false,
  position: 0,
  duration: 0,
  track: '',
  art: '',
  error: '',
});

function patch(next: Partial<SpotifyState>) {
  spotifyState.update((s) => ({ ...s, ...next }));
}

/* ------------------------------------------------- favourites and lists */

export function isFavItem(item: MediaItem, favs: MediaItem[] = get(spotifyFavs)): boolean {
  const key = itemKey(item);
  return favs.some((f) => itemKey(f) === key);
}

/** Star or unstar an item. Returns true when it is now a favourite. */
export function toggleFavItem(item: MediaItem): boolean {
  const key = itemKey(item);
  const on = !isFavItem(item);
  spotifyFavs.update((f) => {
    const rest = f.filter((x) => itemKey(x) !== key);
    return on ? [...rest, { ...item }] : rest;
  });
  return on;
}

const valid = (list: MediaItem[]) => list.map((r) => asItem(r, SPOTIFY)).filter((r): r is MediaItem => !!r);

/** The items of a list. */
export function itemsIn(list: string, favs: MediaItem[] = get(spotifyFavs), recents: MediaItem[] = get(recent)): MediaItem[] {
  if (list === 'favs') return valid(favs);
  if (list === 'recent') return valid(recents);
  return SPOTIFY_PRESETS.map((p) => p.item);
}

/* -------------------------------------------------------- titles and covers */

interface Info {
  title: string;
  art: string;
}
const infoCache = new Map<string, Info>();

/** Title and cover of an item, from Spotify's public oEmbed endpoint. */
async function fetchInfo(item: MediaItem): Promise<Info> {
  const key = itemKey(item);
  const cached = infoCache.get(key);
  if (cached) return cached;
  const res = await fetch(SPOTIFY.oembedUrl(item));
  if (!res.ok) throw new Error(`oEmbed ${res.status}`);
  const data = (await res.json()) as { title?: string; thumbnail_url?: string };
  const info = { title: cleanTitle(data.title ?? ''), art: typeof data.thumbnail_url === 'string' && data.thumbnail_url.startsWith('https://') ? data.thumbnail_url : '' };
  infoCache.set(key, info);
  return info;
}

/** Fill in the loaded item's title (when it has none) and cover. */
function describe(item: MediaItem) {
  const key = itemKey(item);
  fetchInfo(item)
    .then((info) => {
      const s = get(spotifyState);
      if (itemKey(s.item) !== key) return;
      const next: Partial<SpotifyState> = {};
      if (info.art && !s.track) next.art = info.art;
      if (info.title && !s.item.title) {
        next.item = { ...s.item, title: info.title };
        recent.retitle(item, info.title);
        spotifyPrefs.set({ item: next.item });
        spotifyFavs.update((f) => f.map((x) => (itemKey(x) === key && !x.title ? { ...x, title: info.title } : x)));
      }
      patch(next);
    })
    .catch(() => {
      /* offline, private or removed: the id stays as the label */
    });
}

/** "spotify:track:<id>" playing inside the loaded playlist or album: show its name and cover. */
let playingUri = '';
function describeTrack(uri: string) {
  if (uri === playingUri) return;
  playingUri = uri;
  const [, kind, id] = uri.split(':');
  const loaded = get(spotifyState).item;
  if (!kind || !id || itemKey(loaded) === `${kind}:${id}`) return patch({ track: '' });
  const track: MediaItem = { kind, id };
  if (!SPOTIFY.isValid(track)) return;
  fetchInfo(track)
    .then((info) => {
      if (playingUri !== uri) return;
      patch({ track: info.title, ...(info.art ? { art: info.art } : {}) });
    })
    .catch(() => {});
}

/* ------------------------------------------------------- Spotify's frame */

interface PlaybackUpdate {
  playingURI?: string;
  isPaused?: boolean;
  isBuffering?: boolean;
  duration?: number;
  position?: number;
}
interface Controller {
  loadUri(uri: string): void;
  play(): void;
  pause(): void;
  resume(): void;
  seek(seconds: number): void;
  addListener(event: string, handler: (e: { data: unknown }) => void): void;
}
interface IFrameAPI {
  createController(el: HTMLElement, options: Record<string, unknown>, callback: (c: Controller) => void): void;
}

const API_URL = 'https://open.spotify.com/embed/iframe-api/v1';
const uriOf = (item: MediaItem) => `spotify:${item.kind}:${item.id}`;

let host: HTMLDivElement | null = null;
let controller: Controller | null = null;
let starting = false;
/** Start playing as soon as the frame is ready. */
let wantPlay = false;
/** The item the frame has been told to load. */
let loadedKey = '';

function loadApi(): Promise<IFrameAPI> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { onSpotifyIframeApiReady?: (api: IFrameAPI) => void };
    w.onSpotifyIframeApiReady = resolve;
    const script = document.createElement('script');
    script.src = API_URL;
    script.async = true;
    script.onerror = () => reject(new Error('script'));
    document.head.appendChild(script);
    setTimeout(() => reject(new Error('timeout')), 15000);
  });
}

function hostEl(): HTMLDivElement {
  if (host) return host;
  host = document.createElement('div');
  host.className = 'spotify-host';
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, { position: 'fixed', overflow: 'hidden', borderRadius: '12px', width: '320px', height: '352px' });
  document.body.appendChild(host);
  park();
  return host;
}

/** Create the frame (once) with the current item loaded. */
function ensure() {
  if (controller || starting || typeof document === 'undefined') return;
  starting = true;
  const item = get(spotifyState).item;
  loadedKey = itemKey(item);
  patch({ status: 'loading', error: '' });
  describe(item);
  const target = document.createElement('div');
  hostEl().appendChild(target);
  loadApi()
    .then((api) => {
      api.createController(target, { uri: uriOf(item), width: '100%', height: '100%', ...(darkTheme() ? { theme: 'dark' } : {}) }, (c) => {
        controller = c;
        starting = false;
        // Spotify marks its frame lazy, which would wait until it scrolls into view.
        host?.querySelector('iframe')?.setAttribute('loading', 'eager');
        c.addListener('ready', onReady);
        c.addListener('playback_update', (e) => onUpdate((e.data ?? {}) as PlaybackUpdate));
        c.addListener('error', (e) => {
          const message = (e.data as { message?: string } | undefined)?.message;
          patch({ status: 'error', error: message ? `Spotify: ${message}` : 'Spotify could not play this.' });
        });
        // The item changed while the frame was being created.
        const now = get(spotifyState).item;
        if (itemKey(now) !== loadedKey) {
          loadedKey = itemKey(now);
          c.loadUri(uriOf(now));
        }
        follow();
      });
    })
    .catch(() => {
      starting = false;
      wantPlay = false;
      patch({ status: 'error', error: 'Spotify could not be reached. Check your connection or an ad blocker.' });
    });
}

function onReady() {
  const s = get(spotifyState);
  if (s.status === 'loading' || s.status === 'off' || s.status === 'error') patch({ status: 'ready', error: '' });
  if (wantPlay) {
    wantPlay = false;
    controller?.play();
  }
}

function onUpdate(u: PlaybackUpdate) {
  const duration = Number(u.duration) || 0;
  const position = Math.min(Number(u.position) || 0, duration || Infinity);
  // Nothing has been played yet: the frame reports a paused, empty state.
  const started = duration > 0 || u.isPaused === false;
  const s = get(spotifyState);
  patch({
    status: !started ? (s.status === 'loading' ? 'ready' : s.status) : u.isPaused ? 'paused' : 'playing',
    buffering: !!u.isBuffering,
    position,
    duration,
    error: '',
  });
  if (u.playingURI) describeTrack(u.playingURI);
}

/* ----------------------------------------------------------------- controls */

/** Load an item (and remember it). With `play`, start it too. */
export function loadSpotify(item: MediaItem, opts: { play?: boolean } = {}) {
  const chosen = recordPlay('spotify', SPOTIFY_PRESETS, item);
  const key = itemKey(chosen);
  spotifyPrefs.set({ item: chosen });
  const same = key === itemKey(get(spotifyState).item);
  if (!same) {
    playingUri = '';
    patch({ item: chosen, position: 0, duration: 0, track: '', art: '', error: '' });
  } else if (chosen.title && !get(spotifyState).item.title) patch({ item: chosen });
  if (opts.play) wantPlay = true;
  if (!controller) return ensure();
  describe(chosen);
  if (key !== loadedKey) {
    loadedKey = key;
    patch({ status: 'loading' });
    controller.loadUri(uriOf(chosen));
    // The frame reloads and reports "ready": onReady starts it then.
  } else if (opts.play) {
    wantPlay = false;
    playSpotify();
  }
}

export function playSpotify() {
  if (!controller) {
    wantPlay = true;
    return ensure();
  }
  const s = get(spotifyState);
  if (s.status === 'loading') {
    wantPlay = true;
    patch({});
  } else if (s.status === 'paused' && s.position > 0) controller.resume();
  else controller.play();
}

export function pauseSpotify() {
  wantPlay = false;
  const s = get(spotifyState);
  if (controller && (s.status === 'playing' || s.buffering)) controller.pause();
  else patch({});
}

export function isSpotifyLive(s: SpotifyState = get(spotifyState)): boolean {
  return s.status === 'playing' || (s.status === 'loading' && wantPlay);
}

export function toggleSpotify() {
  if (isSpotifyLive()) pauseSpotify();
  else playSpotify();
}

/** Jump to a point in the current track, in seconds. */
export function seekSpotify(seconds: number) {
  if (!controller) return;
  const s = Math.max(0, Math.floor(seconds));
  controller.seek(s);
  patch({ position: s * 1000 });
}

/**
 * Load and play the next (1) or previous (-1) item of the chosen list,
 * wrapping around. An empty list (no favourites yet) steps through the presets.
 */
export function stepSpotify(dir: 1 | -1): MediaItem {
  const chosen = itemsIn(get(spotifyList));
  const list = chosen.length ? chosen : itemsIn('presets');
  const key = itemKey(get(spotifyState).item);
  const at = list.findIndex((x) => itemKey(x) === key);
  const next = list[at < 0 ? (dir === 1 ? 0 : list.length - 1) : (at + dir + list.length) % list.length];
  loadSpotify(next, { play: true });
  return get(spotifyState).item;
}

/** Create the frame without playing, so a visible Spotify pane is ready to go. */
export function warmSpotify() {
  ensure();
}

/* ------------------------------------------- showing Spotify's own frame */

const slots: HTMLElement[] = [];
let raf = 0;

/**
 * Out of sight, but still inside the window: the browser only loads (and
 * keeps running) a frame that is on the page, so it is hidden, not moved away.
 */
function park() {
  if (!host) return;
  const st = host.style;
  st.left = '0px';
  st.top = '0px';
  st.zIndex = '-1';
  st.visibility = 'hidden';
  st.pointerEvents = 'none';
}

/** Lay the frame over the slot on top of the stack, every frame while one is shown. */
function follow() {
  cancelAnimationFrame(raf);
  const slot = slots[slots.length - 1];
  if (!slot || !host) return park();
  const place = () => {
    raf = requestAnimationFrame(place);
    if (!host) return;
    const r = slot.getBoundingClientRect();
    const maximized = document.querySelector('.frame.maximized');
    const inPanel = !!slot.closest('[data-music-panel]');
    // Hidden behind another pane that fills the screen.
    if (!slot.isConnected || r.width < 40 || r.height < 40 || (maximized && !inPanel && !maximized.contains(slot))) return park();
    const st = host.style;
    st.visibility = 'visible';
    st.pointerEvents = 'auto';
    st.left = `${r.left}px`;
    st.top = `${r.top}px`;
    st.width = `${r.width}px`;
    st.height = `${r.height}px`;
    st.zIndex = inPanel ? '61' : maximized ? '41' : '4';
  };
  place();
}

/**
 * Show Spotify's own frame over `slot` (an empty element that reserves the
 * room). Returns the function that hides it again.
 */
export function attachSpotify(slot: HTMLElement): () => void {
  slots.push(slot);
  ensure();
  hostEl();
  follow();
  return () => {
    const i = slots.lastIndexOf(slot);
    if (i >= 0) slots.splice(i, 1);
    follow();
  };
}
