<script lang="ts">
  import type { Config } from '../../core/types';
  import PlayerView, { type Row } from '../music/PlayerView.svelte';
  import { RADIO_LISTS, radioFavs, radioList, radioPrefs, radioState, setVolume, stationsIn, stepStation, toggleFavStation, toggleRadio, tune, type RadioStatus } from './player';
  import { findStation } from './stations';

  export let paneId = '';
  export let focused = false;
  export let config: Config = {};
  export let updateConfig: (patch: Config) => void = () => {};
  /** Drawn inside the status bar's music panel. */
  export let panel = false;
  $: void paneId, focused, config, updateConfig;

  $: s = $radioState;

  const LABEL: Record<RadioStatus, string> = {
    off: 'not playing',
    connecting: 'connecting',
    playing: 'live',
    paused: 'paused',
    error: 'unavailable',
  };

  $: lists = RADIO_LISTS.map((l) => (l.id === 'favs' ? { ...l, label: `favourites ${$radioFavs.length}` } : l));
  let rows: Row[] = [];
  $: rows = stationsIn($radioList, $radioFavs).map((st) => ({ key: st.slug, name: st.name, note: st.note, on: st.slug === s.station.slug, fav: $radioFavs.includes(st.slug) }));

  function pick(slug: string) {
    const st = findStation(slug);
    if (st) tune(st);
  }
</script>

<PlayerView
  kicker="free radio · {s.station.genre}"
  glyph="♪"
  title={s.station.name}
  note={s.station.note}
  live={s.status === 'playing' || s.status === 'connecting'}
  busy={s.status === 'connecting'}
  status={LABEL[s.status]}
  error={s.error}
  fav={$radioFavs.includes(s.station.slug)}
  thing="station"
  volume={$radioPrefs.volume}
  {lists}
  list={$radioList}
  {rows}
  empty="No favourite stations yet. Press the star next to a station to keep it here."
  {panel}
  on:toggle={toggleRadio}
  on:step={(e) => stepStation(e.detail)}
  on:fav={() => toggleFavStation(s.station.slug)}
  on:favrow={(e) => toggleFavStation(e.detail)}
  on:pick={(e) => pick(e.detail)}
  on:list={(e) => radioList.set(e.detail)}
  on:volume={(e) => setVolume(e.detail)}
>
  <svelte:fragment slot="footer">
    Streamed live from <a href={s.station.site} target="_blank" rel="noopener noreferrer">{s.station.name}</a>. Stations rely on listeners, so consider supporting the ones you enjoy.
  </svelte:fragment>
</PlayerView>
