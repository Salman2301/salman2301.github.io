<script lang="ts">
  import type { Config } from '../../core/types';
  import { radioPrefs, radioState, setVolume, toggleRadio, tune, type RadioStatus } from './player';
  import { STATIONS } from './stations';

  export let paneId: string;
  export let focused = false;
  export let config: Config = {};
  export let updateConfig: (patch: Config) => void = () => {};
  $: void paneId, focused, config, updateConfig;

  $: s = $radioState;
  $: live = s.status === 'playing' || s.status === 'connecting';

  const LABEL: Record<RadioStatus, string> = {
    off: 'not playing',
    connecting: 'connecting',
    playing: 'live',
    paused: 'paused',
    error: 'unavailable',
  };

  function volume(e: Event) {
    setVolume(Number((e.currentTarget as HTMLInputElement).value));
  }
</script>

<div class="radio">
  <header>
    <p class="kicker">SomaFM · free and ad-free</p>
    <h2>{s.station.name}</h2>
    <p class="note">{s.station.note}</p>
  </header>

  <div class="deck">
    <button class="play" class:live on:click={toggleRadio} aria-pressed={live} aria-label={live ? 'Pause' : 'Play'}>
      {live ? '❚❚' : '▶'}
    </button>
    <div class="status" class:live class:error={s.status === 'error'} role="status">
      <span class="dot" />{LABEL[s.status]}
      {#if s.error}<p class="err">{s.error}</p>{/if}
    </div>
    <label class="vol">
      <span>vol</span>
      <input type="range" min="0" max="1" step="0.05" value={$radioPrefs.volume} on:input={volume} aria-label="Volume" />
    </label>
  </div>

  <ul class="stations" aria-label="Stations">
    {#each STATIONS as st (st.slug)}
      <li>
        <button class="station" class:on={st.slug === s.station.slug} aria-current={st.slug === s.station.slug ? 'true' : undefined} on:click={() => tune(st)}>
          <span class="name">{st.name}</span>
          <span class="meta">{st.note}</span>
        </button>
      </li>
    {/each}
  </ul>

  <p class="credit">
    Streams by <a href="https://somafm.com" target="_blank" rel="noopener noreferrer">SomaFM</a>, listener-supported. Consider a donation if you listen a lot.
  </p>
</div>

<style>
  .radio {
    height: 100%;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 14px 16px;
    background: var(--bg1);
    color: var(--t2);
    font-size: 13px;
  }
  .kicker {
    margin: 0;
    color: var(--t1);
    font-size: 11px;
    letter-spacing: 0.04em;
  }
  h2 {
    margin: 2px 0 0;
    color: var(--hl1);
    font-size: 20px;
    font-weight: 600;
  }
  .note {
    margin: 2px 0 0;
    color: var(--t1);
  }
  .deck {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid var(--bg2);
    background: color-mix(in srgb, var(--bg2) 18%, var(--bg1));
  }
  .play {
    width: 40px;
    height: 40px;
    flex: 0 0 40px;
    display: grid;
    place-items: center;
    border: 1px solid var(--hl1);
    background: var(--hl1);
    color: var(--bg1);
    font-size: 14px;
    cursor: pointer;
  }
  .play:not(.live) {
    background: transparent;
    color: var(--hl1);
  }
  .play:hover {
    filter: brightness(1.1);
  }
  .status {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
    color: var(--t1);
  }
  .status.live {
    color: var(--hl1);
  }
  .status.error {
    color: var(--t2);
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--t1);
  }
  .status.live .dot {
    background: var(--hl1);
    box-shadow: 0 0 8px var(--hl1);
  }
  .err {
    margin: 0 0 0 6px;
    color: var(--t1);
  }
  .vol {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--t1);
  }
  .vol input {
    width: 110px;
    accent-color: var(--hl1);
    cursor: pointer;
  }
  .stations {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 8px;
  }
  .station {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    padding: 9px 10px;
    text-align: left;
    border: 1px solid var(--bg2);
    border-left: 3px solid transparent;
    background: transparent;
    color: var(--t2);
    font: inherit;
    cursor: pointer;
  }
  .station:hover {
    border-color: color-mix(in srgb, var(--hl1) 60%, var(--bg2));
    background: color-mix(in srgb, var(--bg2) 22%, var(--bg1));
  }
  .station.on {
    border-left-color: var(--hl1);
    background: color-mix(in srgb, var(--hl1) 12%, var(--bg1));
    color: var(--hl1);
  }
  .station .name {
    font-weight: 600;
  }
  .station .meta {
    color: var(--t1);
    font-size: 12px;
    line-height: 1.35;
  }
  .credit {
    margin: auto 0 0;
    color: var(--t1);
    font-size: 11px;
  }
  .credit a {
    color: var(--hl1);
  }
  :focus-visible {
    outline: 1px solid var(--hl1);
    outline-offset: 2px;
  }
</style>
