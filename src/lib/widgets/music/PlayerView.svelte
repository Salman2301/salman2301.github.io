<script lang="ts" context="module">
  export interface Row {
    key: string;
    name: string;
    note: string;
    /** The one that is loaded. */
    on: boolean;
    fav: boolean;
  }
</script>

<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  /**
   * The one look both music players share: the Radio pane, the Spotify pane
   * and the music panel of the status bar all draw this, each with its own
   * data. Like the other widgets it fits the pane instead of scrolling: a
   * tiny pane is one row (play, name, previous / next), a bigger one adds the
   * header and the deck, and from there the list of stations or playlists
   * gets whatever room is left (only the list scrolls).
   */
  export let kicker = '';
  export let glyph = '♪';
  export let title = '';
  export let note = '';
  /** Cover image, when there is one. */
  export let art = '';
  export let live = false;
  export let busy = false;
  export let status = '';
  export let error = '';
  /** The loaded station or playlist is a favourite. */
  export let fav = false;
  /** What the lists hold, for labels: "station" or "playlist". */
  export let thing = 'station';
  /** Milliseconds; a duration of 0 hides the progress bar. */
  export let position = 0;
  export let duration = 0;
  /** 0 to 1; null hides the volume slider. */
  export let volume: number | null = null;
  export let lists: { id: string; label: string }[] = [];
  export let list = '';
  export let rows: Row[] = [];
  /** Shown when the chosen list is empty. */
  export let empty = '';
  /** Replace the list with the default slot (Spotify's own frame). */
  export let stage = false;
  /** Inside the status bar panel: a fixed, roomy layout. */
  export let panel = false;

  const dispatch = createEventDispatcher<{ toggle: void; step: 1 | -1; fav: void; favrow: string; pick: string; list: string; volume: number; seek: number }>();

  let w = 0;
  let h = 0;
  $: tiny = !panel && w > 0 && (h < 150 || w < 230);
  $: roomy = panel || (!tiny && w >= 360 && h >= 330);
  $: showList = panel || (!tiny && h >= 250);
  $: showNote = roomy || (!tiny && h >= 200);
  $: showProgress = duration > 0 && !tiny && (h >= 190 || panel);
  $: showVolume = volume !== null && !tiny && (w >= 300 || panel);
  $: cards = roomy && (w >= 420 || panel);
  // The footer is the first thing to go when the list needs the room.
  $: showFooter = roomy && (h >= 470 || panel);

  const clock = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  // While the thumb is dragged, show where it is, not where playback is.
  let dragging: number | null = null;
  function seekInput(e: Event) {
    dragging = Number((e.currentTarget as HTMLInputElement).value);
  }
  function seekChange(e: Event) {
    dispatch('seek', Number((e.currentTarget as HTMLInputElement).value));
    dragging = null;
  }
  $: shownPos = dragging !== null ? dragging * 1000 : position;
</script>

<div class="music" class:tiny class:roomy class:panel class:live bind:clientWidth={w} bind:clientHeight={h}>
  {#if tiny}
    <div class="row">
      <button class="play" on:click={() => dispatch('toggle')} aria-pressed={live} aria-label={live ? 'Pause' : 'Play'}>{live ? '❚❚' : '▶'}</button>
      <span class="tname" title="{title}: {status}"><span class="dot" />{title}</span>
      <button class="nav" on:click={() => dispatch('step', -1)} aria-label="Previous {thing}">‹</button>
      <button class="nav" on:click={() => dispatch('step', 1)} aria-label="Next {thing}">›</button>
    </div>
  {:else}
    <header>
      {#if roomy}
        <span class="art" aria-hidden="true">
          {#if art}<img src={art} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}{glyph}{/if}
        </span>
      {/if}
      <div class="titles">
        {#if roomy && kicker}<p class="kicker">{kicker}</p>{/if}
        <h2 {title}>{title}</h2>
        {#if showNote && note}<p class="note" title={note}>{note}</p>{/if}
      </div>
      <button class="star" class:on={fav} on:click={() => dispatch('fav')} aria-pressed={fav} title={fav ? 'Remove from favourites' : 'Add to favourites'} aria-label={fav ? `Remove this ${thing} from favourites` : `Add this ${thing} to favourites`}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" /></svg>
      </button>
    </header>

    <div class="deck">
      <button class="play" on:click={() => dispatch('toggle')} aria-pressed={live} aria-label={live ? 'Pause' : 'Play'}>{live ? '❚❚' : '▶'}</button>
      <button class="nav" on:click={() => dispatch('step', -1)} title="Previous {thing}" aria-label="Previous {thing}">‹</button>
      <button class="nav" on:click={() => dispatch('step', 1)} title="Next {thing}" aria-label="Next {thing}">›</button>
      <div class="status" class:error={!!error} role="status">
        <span class="dot" class:busy />{status}
      </div>
      {#if showVolume && volume !== null}
        <label class="vol">
          {#if w >= 400}<span>vol</span>{/if}
          <input type="range" min="0" max="1" step="0.05" value={volume} on:input={(e) => dispatch('volume', Number(e.currentTarget.value))} aria-label="Volume" />
        </label>
      {/if}
    </div>

    {#if error}<p class="err" role="alert">{error}</p>{/if}

    {#if showProgress}
      <label class="progress">
        <span>{clock(shownPos)}</span>
        <input type="range" min="0" max={Math.max(1, Math.floor(duration / 1000))} step="1" value={Math.floor(shownPos / 1000)} on:input={seekInput} on:change={seekChange} aria-label="Position in the track" />
        <span>{clock(duration)}</span>
      </label>
    {/if}

    {#if showList}
      {#if lists.length}
        <div class="lists" role="tablist" aria-label="Lists">
          {#each lists as l (l.id)}
            <button class="tab" class:on={l.id === list} role="tab" aria-selected={l.id === list} on:click={() => dispatch('list', l.id)}>{l.label}</button>
          {/each}
        </div>
      {/if}
      <slot name="tools" />
      {#if stage}
        <div class="stage"><slot /></div>
      {:else if rows.length}
        <ul class="rows" class:cards aria-label="{thing}s">
          {#each rows as r (r.key)}
            <li class:on={r.on}>
              <button class="pick" aria-current={r.on ? 'true' : undefined} title={r.note} on:click={() => dispatch('pick', r.key)}>
                <span class="name">{r.name}</span>
                {#if r.note}<span class="meta">{r.note}</span>{/if}
              </button>
              <button class="star small" class:on={r.fav} on:click={() => dispatch('favrow', r.key)} aria-pressed={r.fav} title={r.fav ? 'Remove from favourites' : 'Add to favourites'} aria-label="{r.fav ? 'Remove' : 'Add'} {r.name} {r.fav ? 'from' : 'to'} favourites">
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" /></svg>
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="empty">{empty}</p>
      {/if}
    {/if}

    {#if showFooter && $$slots.footer}<div class="footer"><slot name="footer" /></div>{/if}
  {/if}
</div>

<style>
  .music {
    height: 100%;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 10px;
    padding: 10px 12px;
    background: var(--bg1);
    color: var(--t2);
    font-size: 13px;
  }
  .music.roomy {
    justify-content: flex-start;
    gap: 12px;
    padding: 14px 16px;
  }
  .music.panel {
    padding: 0;
    background: transparent;
  }
  .music.tiny {
    padding: 6px 8px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex: none;
  }
  .art {
    flex: none;
    width: 46px;
    height: 46px;
    display: grid;
    place-items: center;
    overflow: hidden;
    border: 1px solid var(--bg2);
    border-radius: 8px;
    background: color-mix(in srgb, var(--hl1) 10%, var(--bg1));
    color: var(--hl1);
    font-size: 20px;
  }
  .art img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .titles {
    flex: 1;
    min-width: 0;
  }
  .kicker {
    margin: 0;
    color: var(--t1);
    font-size: 11px;
    letter-spacing: 0.04em;
  }
  h2 {
    margin: 0;
    color: var(--hl1);
    font-size: 17px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .roomy h2 {
    font-size: 19px;
  }
  .note {
    margin: 1px 0 0;
    color: var(--t1);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .star {
    flex: none;
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    color: var(--t1);
  }
  .star svg {
    width: 17px;
    height: 17px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.2;
    stroke-linejoin: round;
  }
  .star.small {
    width: 26px;
    height: 26px;
    opacity: 0.55;
  }
  .star.small svg {
    width: 14px;
    height: 14px;
  }
  .star:hover {
    color: var(--hl1);
    opacity: 1;
    background: color-mix(in srgb, var(--bg2) 50%, transparent);
  }
  .star.on {
    color: var(--hl1);
    opacity: 1;
  }
  .star.on svg {
    fill: currentColor;
  }
  .deck {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 7px 9px;
    border: 1px solid var(--bg2);
    border-radius: 8px;
    background: color-mix(in srgb, var(--bg2) 18%, var(--bg1));
  }
  .play {
    width: 34px;
    height: 34px;
    flex: 0 0 34px;
    display: grid;
    place-items: center;
    border: 1px solid var(--hl1);
    border-radius: 50%;
    background: transparent;
    color: var(--hl1);
    font-size: 12px;
    cursor: pointer;
  }
  .live .play {
    background: var(--hl1);
    color: var(--bg1);
  }
  .play:hover {
    filter: brightness(1.1);
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
  .status {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
    color: var(--t1);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .live .status {
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
  .dot.busy {
    animation: pulse 1s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.3;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .dot.busy {
      animation: none;
    }
  }
  .vol {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 0 1 120px;
    min-width: 60px;
    color: var(--t1);
    font-size: 12px;
  }
  input[type='range'] {
    width: 100%;
    min-width: 0;
    accent-color: var(--hl1);
    cursor: pointer;
  }
  .progress {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--t1);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .err {
    flex: none;
    margin: 0;
    color: var(--t1);
    font-size: 12px;
    line-height: 1.35;
  }
  .lists {
    flex: none;
    display: flex;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .lists::-webkit-scrollbar {
    display: none;
  }
  .tab {
    flex: none;
    padding: 3px 10px;
    border: 1px solid var(--bg2);
    border-radius: 999px;
    color: var(--t1);
    font-size: 12px;
    white-space: nowrap;
  }
  .tab:hover {
    color: var(--t2);
    border-color: color-mix(in srgb, var(--hl1) 60%, var(--bg2));
  }
  .tab.on {
    border-color: var(--hl1);
    color: var(--hl1);
    background: color-mix(in srgb, var(--hl1) 12%, transparent);
  }
  .rows {
    flex: 1;
    min-height: 0;
    list-style: none;
    margin: 0;
    padding: 0 2px 0 0;
    display: grid;
    grid-template-columns: 1fr;
    align-content: start;
    gap: 4px;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--bg2) transparent;
  }
  .rows.cards {
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 6px;
  }
  .panel .rows.cards {
    grid-template-columns: 1fr;
    gap: 4px;
  }
  li {
    display: flex;
    align-items: center;
    min-width: 0;
    border: 1px solid var(--bg2);
    border-left: 3px solid transparent;
    border-radius: 6px;
  }
  li:hover {
    border-color: color-mix(in srgb, var(--hl1) 60%, var(--bg2));
    background: color-mix(in srgb, var(--bg2) 22%, var(--bg1));
  }
  li.on {
    border-left-color: var(--hl1);
    background: color-mix(in srgb, var(--hl1) 12%, var(--bg1));
  }
  .pick {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
    padding: 6px 4px 6px 9px;
    text-align: left;
    color: var(--t2);
  }
  li.on .name {
    color: var(--hl1);
  }
  .name {
    max-width: 100%;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meta {
    max-width: 100%;
    color: var(--t1);
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .empty {
    flex: 1;
    margin: 0;
    padding: 12px 4px;
    color: var(--t1);
    font-size: 12px;
    line-height: 1.5;
    text-align: center;
  }
  .stage {
    flex: 1;
    min-height: 0;
    display: flex;
  }
  .footer {
    flex: none;
    color: var(--t1);
    font-size: 11px;
  }
  .footer :global(a) {
    color: var(--hl1);
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
    font-weight: 600;
  }
  .live .tname {
    color: var(--hl1);
  }
  :focus-visible {
    outline: 1px solid var(--hl1);
    outline-offset: 2px;
  }
  @media (max-width: 720px), (pointer: coarse) {
    .tab {
      padding: 6px 12px;
    }
    .pick {
      padding: 9px 4px 9px 10px;
    }
    .star.small {
      width: 36px;
      height: 36px;
    }
    .nav {
      width: 32px;
      height: 32px;
    }
  }
</style>
