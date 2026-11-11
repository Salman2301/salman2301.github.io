import { derived, get } from 'svelte/store';
import { labelOf } from '../widgets/media/media';
import { pause as pauseRadio, play as playRadio, radioState, stepStation, toggleRadio } from '../widgets/radio/player';
import { isSpotifyLive, pauseSpotify, playSpotify, spotifyState, stepSpotify, toggleSpotify } from '../widgets/spotify/player';
import { persisted } from './storage';

/**
 * Radio and Spotify behave as one music player: only one of them plays at a
 * time, and the status bar, the Alt shortcuts and the phone menu control
 * whichever you used last (the "source").
 */

export type MusicSource = 'radio' | 'spotify';

export const musicSource = persisted<MusicSource>('music:source', 'radio');

export interface NowPlaying {
  source: MusicSource;
  /** Station or playlist name. */
  title: string;
  /** Playing, or about to. */
  live: boolean;
  /** Connecting or loading. */
  busy: boolean;
  error: boolean;
}

export const nowPlaying = derived([musicSource, radioState, spotifyState], ([$source, $radio, $spotify]): NowPlaying => {
  if ($source === 'spotify') {
    return {
      source: 'spotify',
      title: labelOf($spotify.item),
      live: isSpotifyLive($spotify),
      busy: $spotify.status === 'loading' || $spotify.buffering,
      error: $spotify.status === 'error',
    };
  }
  return {
    source: 'radio',
    title: $radio.station.name,
    live: $radio.status === 'playing' || $radio.status === 'connecting',
    busy: $radio.status === 'connecting',
    error: $radio.status === 'error',
  };
});

/** Choose which player the status bar and shortcuts control (when nothing is playing). */
export function useSource(source: MusicSource) {
  if (!get(nowPlaying).live) musicSource.set(source);
}

export function toggleMusic() {
  if (get(musicSource) === 'spotify') toggleSpotify();
  else toggleRadio();
}

export function playMusic() {
  if (get(musicSource) === 'spotify') playSpotify();
  else playRadio();
}

export function pauseMusic() {
  pauseRadio();
  pauseSpotify();
}

/** Next (1) or previous (-1) station or playlist of the current source. Returns its name. */
export function stepMusic(dir: 1 | -1): string {
  return get(musicSource) === 'spotify' ? labelOf(stepSpotify(dir)) : stepStation(dir).name;
}

let started = false;

/** Keep the two players from playing over each other. Call once at startup. */
export function startMusic() {
  if (started) return;
  started = true;
  let radioLive = false;
  let spotifyLive = false;
  radioState.subscribe((s) => {
    const live = s.status === 'playing' || s.status === 'connecting';
    if (live && !radioLive) {
      musicSource.set('radio');
      pauseSpotify();
    }
    radioLive = live;
  });
  spotifyState.subscribe((s) => {
    const live = isSpotifyLive(s);
    if (live && !spotifyLive) {
      musicSource.set('spotify');
      pauseRadio();
    }
    spotifyLive = live;
  });
}
