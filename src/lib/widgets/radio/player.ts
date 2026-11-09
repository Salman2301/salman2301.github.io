import { get, writable } from 'svelte/store';
import { persisted } from '../../core/storage';
import { DEFAULT_STATION, findStation, type Station } from './stations';

/**
 * The one radio player on the page. The Radio pane, the status bar control
 * and the `radio` command all drive it. It lives outside any pane, so the
 * music keeps going when panes move, close or change template.
 *
 * Pausing drops the connection, so play joins the station live rather than
 * resuming a buffer that has fallen behind the broadcast.
 */

export type RadioStatus = 'off' | 'connecting' | 'playing' | 'paused' | 'error';

export interface RadioState {
  station: Station;
  status: RadioStatus;
  /** Set when the status is 'error'. */
  error: string;
}

/** What survives a reload: the last station and the volume. Never auto-plays. */
export const radioPrefs = persisted('radio', { slug: DEFAULT_STATION.slug, volume: 0.6 });

export const radioState = writable<RadioState>({
  station: findStation(get(radioPrefs).slug) ?? DEFAULT_STATION,
  status: 'off',
  error: '',
});

let audio: HTMLAudioElement | null = null;
/** Index into station.urls of the host currently being tried. */
let urlIndex = 0;

function patch(next: Partial<RadioState>) {
  radioState.update((s) => ({ ...s, ...next }));
}

function element(): HTMLAudioElement {
  if (audio) return audio;
  const a = new Audio();
  a.preload = 'none';
  a.volume = get(radioPrefs).volume;
  a.addEventListener('playing', () => patch({ status: 'playing', error: '' }));
  a.addEventListener('waiting', () => {
    if (get(radioState).status === 'playing') patch({ status: 'connecting' });
  });
  a.addEventListener('error', onStreamError);
  a.addEventListener('ended', onStreamError);
  audio = a;
  return a;
}

/** The current host failed: try the station's next host, else report it. */
function onStreamError() {
  const a = element();
  const { station, status } = get(radioState);
  // Ignore the errors that come from clearing the source on pause or stop.
  if (!a.getAttribute('src') || status === 'off' || status === 'paused') return;
  if (urlIndex + 1 < station.urls.length) {
    urlIndex++;
    a.src = station.urls[urlIndex];
    a.play().catch(() => {});
    return;
  }
  a.removeAttribute('src');
  a.load();
  patch({ status: 'error', error: `${station.name} is not streaming right now. Try another station.` });
}

function connect(station: Station) {
  const a = element();
  urlIndex = 0;
  a.src = station.urls[0];
  patch({ station, status: 'connecting', error: '' });
  a.play().catch((err: DOMException) => {
    // A newer request replaced this one, or the stream error handler reports it.
    if (err.name === 'NotAllowedError') patch({ status: 'paused', error: 'Press play to start the radio.' });
  });
}

/** Tune in to a station and play it. */
export function tune(station: Station) {
  radioPrefs.update((p) => ({ ...p, slug: station.slug }));
  connect(station);
}

/** Play the current station. */
export function play() {
  connect(get(radioState).station);
}

/** Stop and drop the connection. Pressing play again rejoins the station live. */
export function pause() {
  if (!audio) return;
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  patch({ status: 'paused', error: '' });
}

export function toggleRadio() {
  const { status } = get(radioState);
  if (status === 'playing' || status === 'connecting') pause();
  else play();
}

export function setVolume(volume: number) {
  const v = Math.min(1, Math.max(0, volume));
  radioPrefs.update((p) => ({ ...p, volume: v }));
  if (audio) audio.volume = v;
}

/* ------------------------------------------------- OS media keys and lock screen */

radioState.subscribe((s) => {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;
  if (typeof MediaMetadata !== 'undefined') {
    ms.metadata = new MediaMetadata({ title: s.station.name, artist: 'Radio', album: s.station.note });
  }
  ms.playbackState = s.status === 'playing' || s.status === 'connecting' ? 'playing' : 'paused';
  ms.setActionHandler('play', play);
  ms.setActionHandler('pause', pause);
});
