<script lang="ts">
  import type { Config } from '../../core/types';
  import { radioPrefs, radioState, setVolume, stepStation, toggleRadio, tune, type RadioStatus } from './player';
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

  // Like the other widgets, the layout fits the pane instead of scrolling:
  // tiny is one row (play, name, previous / next), compact adds the status and
  // station chips, roomy shows station cards with their descriptions.
  let w = 0;
  let h = 0;
  $: tiny = w > 0 && (h < 150 || w < 230);
  $: roomy = !tiny && w >= 380 && h >= 340;
  $: compact = !tiny && !roomy;
  $: showChips = compact && h >= 230;
  $: showVolume = !tiny && w >= 300;
  $: showNote = roomy || (compact && h >= 280);
  $: showCredit = roomy && h >= 460;

  const step = (dir: 1 | -1) => stepStation(dir);

  function volume(e: Event) {
    setVolume(Number((e.currentTarget as HTMLInputElement).value));
  }
</script>

<div class="radio" class:tiny class:compact class:roomy bind:clientWidth={w} bind:clientHeight={h}>
  {#if tiny}
    <div class="row">
      <button class="play" class:live on:click={toggleRadio} aria-pressed={live} aria-label={live ? 'Pause' : 'Play'}>{live ? '❚❚' : '▶'}</button>
      <span class="tname" class:live title="{s.station.name}: {LABEL[s.status]}"><span class="dot" />{s.station.name}</span>
      <button class="nav" on:click={() => step(-1)} aria-label="Previous station">‹</button>
      <button class="nav" on:click={() => step(1)} aria-label="Next station">›</button>
    </div>
  {:else}
    <header>
      {#if roomy}<p class="kicker">free radio</p>{/if}
      <h2>{s.station.name}</h2>
      {#if showNote}<p class="note">{s.station.note}</p>{/if}
    </header>

    <div class="deck">
      <button class="play" class:live on:click={toggleRadio} aria-pressed={live} aria-label={live ? 'Pause' : 'Play'}>{live ? '❚❚' : '▶'}</button>
      <div class="status" class:live class:error={s.status === 'error'} role="status">
        <span class="dot" />{LABEL[s.status]}
        {#if s.error && roomy}<p class="err">{s.error}</p>{/if}
      </div>
      {#if !roomy}
        <button class="nav" on:click={() => step(-1)} aria-label="Previous station">‹</button>
        <button class="nav" on:click={() => step(1)} aria-label="Next station">›</button>
      {/if}
      {#if showVolume}
        <label class="vol">
          {#if roomy}<span>vol</span>{/if}
          <input type="range" min="0" max="1" step="0.05" value={$radioPrefs.volume} on:input={volume} aria-label="Volume" />
        </label>
      {/if}
    </div>

    {#if roomy}
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
    {:else if showChips}
      <ul class="chips" aria-label="Stations">
        {#each STATIONS as st (st.slug)}
          <li>
            <button class="chip" class:on={st.slug === s.station.slug} aria-current={st.slug === s.station.slug ? 'true' : undefined} title={st.note} on:click={() => tune(st)}>{st.name}</button>
          </li>
        {/each}
      </ul>
    {/if}

    {#if showCredit}
      <p class="credit">
        Streamed live from <a href={s.station.site} target="_blank" rel="noopener noreferrer">{s.station.name}</a>. Stations rely on listeners, so consider supporting the ones you enjoy.
      </p>
    {/if}
  {/if}
</div>

<style>
  .radio {
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 14px 16px;
    background: var(--bg1);
    color: var(--t2);
    font-size: 13px;
  }
  .radio.compact {
    gap: 10px;
    padding: 10px 12px;
    justify-content: center;
  }
  .radio.tiny {
    padding: 6px 8px;
    justify-content: center;
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
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .compact h2 {
    font-size: 17px;
  }
  .note {
    margin: 2px 0 0;
    color: var(--t1);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .deck {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding: 10px 12px;
    border: 1px solid var(--bg2);
    background: color-mix(in srgb, var(--bg2) 18%, var(--bg1));
  }
  .compact .deck {
    gap: 8px;
    padding: 6px 8px;
    border-radius: 8px;
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
  .compact .play,
  .tiny .play {
    width: 32px;
    height: 32px;
    flex-basis: 32px;
    border-radius: 50%;
    font-size: 12px;
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
    white-space: nowrap;
    overflow: hidden;
  }
  .status.live {
    color: var(--hl1);
  }
  .status.error {
    color: var(--t2);
  }
  .dot {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--t1);
  }
  .live .dot {
    background: var(--hl1);
    box-shadow: 0 0 8px var(--hl1);
  }
  .err {
    margin: 0 0 0 6px;
    color: var(--t1);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .nav {
    flex: none;
    width: 26px;
    height: 26px;
    border-radius: 6px;
    color: var(--t1);
    font-size: 16px;
    line-height: 1;
  }
  .nav:hover {
    color: var(--hl1);
    background: color-mix(in srgb, var(--bg2) 50%, transparent);
  }
  .vol {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 0 1 110px;
    min-width: 60px;
    color: var(--t1);
  }
  .vol input {
    width: 100%;
    min-width: 0;
    accent-color: var(--hl1);
    cursor: pointer;
  }

  /* roomy: station cards */
  .stations {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 8px;
    min-height: 0;
    overflow: hidden;
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

  /* compact: station chips */
  .chips {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-height: 0;
    overflow: hidden;
  }
  .chip {
    padding: 3px 10px;
    border: 1px solid var(--bg2);
    border-radius: 999px;
    color: var(--t1);
    font-size: 12px;
    white-space: nowrap;
  }
  .chip:hover {
    color: var(--t2);
    border-color: color-mix(in srgb, var(--hl1) 60%, var(--bg2));
  }
  .chip.on {
    border-color: var(--hl1);
    color: var(--hl1);
    background: color-mix(in srgb, var(--hl1) 12%, transparent);
  }

  /* tiny: one row */
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .tname {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--t2);
    font-weight: 600;
  }
  .tname.live {
    color: var(--hl1);
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
  @media (max-width: 720px) {
    /* phones stack panes; give the radio a sensible height of its own */
    .radio {
      min-height: 120px;
    }
  }
</style>
