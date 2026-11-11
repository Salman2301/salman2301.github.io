<script lang="ts">
  import { tick } from 'svelte';
  import type { Config } from '../../core/types';
  import FaceView from './FaceView.svelte';
  import { DEFAULT_FACE, FACES, findFace, stepFace, type FaceDef } from './faces';
  import { secondTick } from './ticker';
  import {
    allZones, cityName, describeZone, formatUtcOffset, isValidZone, localZone, prefers12h, resolveZone, utcOffset,
  } from './zones';

  export let paneId: string;
  export let focused = false;
  export let config: Config = {};
  export let updateConfig: (patch: Config) => void = () => {};

  const MAX_ZONES = 24;

  let def: FaceDef = DEFAULT_FACE;
  $: def = findFace(config.face) ?? DEFAULT_FACE;
  $: face = def.id;
  $: hour12 = typeof config.hour12 === 'boolean' ? config.hour12 : prefers12h();
  $: zones = readZones(config.zones);

  function readZones(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((z): z is string => typeof z === 'string' && isValidZone(z)) : [];
  }

  let root: HTMLDivElement;
  let w = 0;
  let h = 0;
  // the area left for the time once the world list and footer took theirs
  let fw = 0;
  let fh = 0;
  let draft = '';
  let error = '';
  /** Showing the world clock header and the add box ("cities" in the footer). */
  let editingZones = false;
  /** Showing the gallery of faces instead of the clock. */
  let picking = false;
  let gallery: HTMLDivElement;

  // Breakpoints: tiny shows only the time, medium adds the date and the face
  // switches (plus a one-line strip of world times when there is height for
  // it), roomy adds the full world clock list and the key hint.
  $: tiny = w > 0 && (w < 240 || h < 150);
  $: roomy = !tiny && w >= 340 && h >= 320;
  $: wide = roomy && w >= 620 && w > h * 1.4;
  $: strip = !tiny && !roomy && zones.length > 0 && h >= 200;

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  $: dateSize = clamp(fw * 0.034, 11, 18);
  $: showDate = !tiny && !def.ownDate;
  $: dateSpace = (showDate ? dateSize * 1.4 + 10 : 0) + (strip ? 28 : 0);
  // the box the face may fill
  $: faceW = Math.max(40, fw - 8);
  $: faceH = Math.max(40, fh - dateSpace - 4);

  $: now = $secondTick;
  $: dateText = now.toLocaleDateString(
    undefined,
    fw < 360 ? { weekday: 'short', day: 'numeric', month: 'short' } : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  );
  // 12h / 24h only applies to faces that show the hour as digits; a dial is 12 hours.
  $: rows = roomy || strip ? zones.map((z) => describeZone(z, now, def.kind === 'analog' || hour12)) : [];
  // Zen by default: the world clocks appear once a city is added, the add box on request.
  $: showWorld = roomy && (zones.length > 0 || editingZones);
  $: here = localZone();
  $: hereLabel = `${cityName(here)} · ${formatUtcOffset(utcOffset(here, now))}`;
  $: zoneOptions = roomy ? allZones() : [];

  function setFace(next: string) {
    if (next !== face) updateConfig({ face: next });
  }
  function chooseFace(next: string) {
    setFace(next);
    picking = false;
    keepFocus();
  }
  function togglePicker() {
    picking = !picking;
    if (picking) tick().then(() => gallery?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({ block: 'center' }));
    else keepFocus();
  }
  /** Arrow keys walk the gallery's grid. */
  function onGalleryKey(e: KeyboardEvent) {
    const tiles = Array.from(gallery.querySelectorAll<HTMLElement>('.tile'));
    const at = tiles.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    const perRow = Math.max(1, tiles.filter((t) => t.offsetTop === tiles[0].offsetTop).length);
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: perRow, ArrowUp: -perRow }[e.key];
    if (!step) return;
    e.preventDefault();
    tiles[Math.max(0, Math.min(tiles.length - 1, at + step))]?.focus();
  }
  function setHour12(next: boolean) {
    updateConfig({ hour12: next });
  }

  function addZone() {
    const text = draft.trim();
    if (!text) return;
    const zone = resolveZone(text);
    if (!zone) return void (error = `No time zone matches "${text}".`);
    if (zones.includes(zone)) return void (error = `${cityName(zone)} is already on the list.`);
    if (zones.length >= MAX_ZONES) return void (error = `That is plenty: ${MAX_ZONES} zones at most.`);
    updateConfig({ zones: [...zones, zone] });
    draft = '';
    error = '';
  }

  function removeZone(zone: string) {
    updateConfig({ zones: zones.filter((z) => z !== zone) });
    // the focused x button goes with its row; keep the keys in this pane
    keepFocus();
  }

  function onKey(e: KeyboardEvent) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if ((e.target as HTMLElement).closest('input, textarea, select')) return;
    if (e.code === 'Escape' && picking) togglePicker();
    else if (picking) return;
    else if (e.code === 'KeyF') togglePicker();
    else if (e.code === 'KeyA' || e.code === 'BracketRight' || e.code === 'ArrowRight') setFace(stepFace(face, 1).id);
    else if (e.code === 'BracketLeft' || e.code === 'ArrowLeft') setFace(stepFace(face, -1).id);
    else if (e.code === 'KeyH' && def.hours) setHour12(!hour12);
    else return;
    e.preventDefault();
  }

  /** Focus the pane root unless something inside it already has focus. */
  function keepFocus() {
    tick().then(() => {
      if (root && !root.contains(document.activeElement)) root.focus({ preventScroll: true });
    });
  }

  let wasFocused = false;
  $: {
    if (focused && !wasFocused) keepFocus();
    wasFocused = focused;
  }
</script>

<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
<div
  class="clock-pane"
  class:bp-tiny={tiny}
  class:bp-wide={wide}
  bind:this={root}
  bind:clientWidth={w}
  bind:clientHeight={h}
  tabindex="0"
  on:keydown={onKey}
>
  {#if picking}
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="gallery" bind:this={gallery} role="group" aria-label="Clock faces" on:keydown={onGalleryKey}>
      {#each FACES as f (f.id)}
        <button class="tile" aria-pressed={f.id === face} title={f.note} on:click={() => chooseFace(f.id)}>
          <span class="thumb" aria-hidden="true"><FaceView face={f.id} {now} {hour12} w={f.kind === 'analog' ? 68 : 104} h={68} preview /></span>
          <span class="tile-name">{f.name}</span>
        </button>
      {/each}
    </div>
  {/if}
  <div class="clock-body" hidden={picking}>
    <div class="face-area" bind:clientWidth={fw} bind:clientHeight={fh}>
      {#if !picking}<FaceView {face} {now} {hour12} w={faceW} h={faceH} />{/if}
      {#if showDate}
        <p class="date" style="font-size:{dateSize}px">{dateText}</p>
      {/if}
      {#if strip}
        <!-- one line only: chips that wrap to a second line are clipped away -->
        <ul class="zone-strip" aria-label="World clocks">
          {#each rows as r (r.zone)}
            <li title="{r.zone} · {r.relative} · {r.utc}">
              <span class="strip-city">{r.city}</span>
              {r.time}{#if r.days}<span class="strip-day">{r.days > 0 ? '+' : '−'}{Math.abs(r.days)}d</span>{/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    {#if showWorld}
      <section class="world" class:editing={editingZones} aria-label="World clocks">
        {#if editingZones}
          <header class="world-head">
            <span>world clocks</span>
            <span class="here" title={here}>here: {hereLabel}</span>
          </header>
        {/if}
        {#if rows.length}
          <ul class="zone-list">
            {#each rows as r (r.zone)}
              <li class="zone-row" title="{r.zone} · {r.utc}">
                <span class="sky" class:night={!r.daytime} title={r.daytime ? 'daytime' : 'night'}>{r.daytime ? '☼' : '☾'}</span>
                <span class="place">
                  <span class="city">{r.city}</span>
                  <span class="meta">{r.day ? `${r.day} · ` : ''}{r.relative} · {r.utc}</span>
                </span>
                <span class="zone-time">{r.time}</span>
                <button class="zone-rm" title="Remove" aria-label="Remove {r.city}" on:click={() => removeZone(r.zone)}>×</button>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="zone-empty">Add a city to compare times, e.g. Tokyo or New York.</p>
        {/if}
        {#if editingZones}
        <form class="add-zone" on:submit|preventDefault={addZone}>
          <input
            list="tz-{paneId}"
            bind:value={draft}
            on:input={() => (error = '')}
            placeholder="add a city or time zone"
            aria-label="Add a time zone"
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
          />
          <button type="submit" disabled={!draft.trim()}>add</button>
        </form>
        {#if error}<p class="zone-error" role="alert">{error}</p>{/if}
        <datalist id="tz-{paneId}">
          {#each zoneOptions as z}<option value={z} />{/each}
        </datalist>
        {/if}
      </section>
    {/if}
  </div>

  {#if !tiny}
    <footer class="clock-bar">
      <div class="seg faces" role="group" aria-label="Clock face">
        <button class="arrow" on:click={() => setFace(stepFace(face, -1).id)} title="Previous face ([)" aria-label="Previous face">‹</button>
        <button class="face-name" aria-pressed={picking} aria-expanded={picking} on:click={togglePicker} title="All {FACES.length} faces (f)">{def.name}</button>
        <button class="arrow" on:click={() => setFace(stepFace(face, 1).id)} title="Next face (])" aria-label="Next face">›</button>
      </div>
      {#if def.hours && !picking}
        <div class="seg" role="group" aria-label="Hour format">
          <button aria-pressed={!hour12} on:click={() => setHour12(false)}>24h</button>
          <button aria-pressed={hour12} on:click={() => setHour12(true)}>12h</button>
        </div>
      {/if}
      {#if roomy && !picking}
        <button class="cities" aria-pressed={editingZones} on:click={() => (editingZones = !editingZones)} title="World clocks">cities</button>
      {/if}
    </footer>
  {/if}
</div>

<style>
  .clock-pane {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    overflow: hidden;
    outline: none;
    color: var(--t2);
  }
  .clock-pane.bp-tiny {
    padding: 6px;
  }
  .clock-pane :global(*:focus:not(:focus-visible)) {
    outline: none;
  }
  .clock-body {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .bp-wide .clock-body {
    flex-direction: row;
  }
  .face-area {
    flex: 1 1 0;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }

  .clock-body[hidden] {
    display: none;
  }

  /* the gallery of faces */
  .gallery {
    flex: 1 1 0;
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
    grid-auto-rows: min-content;
    gap: 8px;
    padding: 2px;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--bg2) transparent;
  }
  .tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 10px 4px 7px;
    border: 1px solid var(--bg2);
    border-radius: 10px;
    color: var(--t1);
    overflow: hidden;
  }
  .tile:hover,
  .tile:focus-visible {
    border-color: color-mix(in srgb, var(--hl1) 60%, var(--bg2));
    background: color-mix(in srgb, var(--bg2) 22%, var(--bg1));
    color: var(--t2);
    outline: none;
  }
  .tile[aria-pressed='true'] {
    border-color: var(--hl1);
    background: color-mix(in srgb, var(--hl1) 10%, var(--bg1));
    color: var(--hl1);
  }
  .thumb {
    width: 104px;
    height: 68px;
    display: grid;
    place-items: center;
    color: var(--t2);
    pointer-events: none;
  }
  .tile-name {
    font-size: 11px;
    white-space: nowrap;
  }

  .date {
    margin: 0;
    color: var(--t1);
    letter-spacing: 0.04em;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .zone-strip {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0 16px;
    max-width: 100%;
    height: 18px;
    overflow: hidden;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 12px;
    line-height: 18px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .strip-city {
    color: var(--t1);
    margin-right: 2px;
  }
  .strip-day {
    margin-left: 4px;
    font-size: 10px;
    color: var(--hl1);
  }

  /* world clocks */
  .world {
    flex: 0 1 auto;
    max-height: 56%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
    max-width: 560px;
    align-self: center;
  }
  .bp-wide .world {
    flex: 0 0 clamp(280px, 40%, 420px);
    max-height: none;
    justify-content: center;
  }
  .world-head {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--t1);
    padding: 0 4px 4px;
    border-bottom: 1px dashed color-mix(in srgb, var(--bg2) 80%, transparent);
  }
  .here {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    letter-spacing: 0.06em;
    text-transform: none;
  }
  .zone-list {
    flex: 0 1 auto;
    min-height: 0;
    overflow: auto;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .zone-row {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) auto 24px;
    align-items: center;
    gap: 8px;
    padding: 5px 4px;
    border-radius: 6px;
  }
  .zone-row:hover {
    background: color-mix(in srgb, var(--bg2) 40%, transparent);
  }
  .sky {
    text-align: center;
    font-size: 14px;
    color: var(--hl1);
  }
  .sky.night {
    color: var(--t1);
  }
  .place {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .city,
  .meta {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .city {
    font-size: 13px;
  }
  .meta {
    font-size: 10.5px;
    color: var(--t1);
    font-variant-numeric: tabular-nums;
  }
  .zone-time {
    font-size: 16px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .zone-rm {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    color: var(--t1);
    font-size: 15px;
    line-height: 1;
    opacity: 0.55;
  }
  .zone-row:hover .zone-rm,
  .zone-rm:focus-visible {
    opacity: 1;
  }
  .zone-rm:hover {
    color: var(--hl1);
    background: color-mix(in srgb, var(--bg2) 60%, transparent);
  }
  .zone-empty,
  .zone-error {
    margin: 0;
    padding: 2px 4px;
    font-size: 11px;
    color: var(--t1);
  }
  .zone-error {
    color: var(--hl1);
  }
  .add-zone {
    display: flex;
    gap: 6px;
  }
  .add-zone input {
    flex: 1;
    min-width: 0;
    padding: 4px 8px;
    border-radius: 6px;
    border: 1px solid var(--bg2);
    background: var(--bg1);
    color: var(--t2);
    font: inherit;
    font-size: 12px;
    outline: none;
  }
  .add-zone input:focus {
    border-color: var(--hl1);
  }
  .add-zone button {
    padding: 2px 12px;
    border-radius: 6px;
    border: 1px solid var(--bg2);
    color: var(--t2);
    font-size: 12px;
  }
  .add-zone button:hover:not(:disabled) {
    color: var(--hl1);
    border-color: var(--hl1);
  }
  .add-zone button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  /* footer: hidden until the pane is hovered or focused (always shown on touch) */
  .clock-bar {
    flex: 0 0 auto;
    opacity: 0;
    transition: opacity 200ms ease;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px 10px;
  }
  .clock-pane:hover .clock-bar,
  .clock-pane:focus-within .clock-bar {
    opacity: 1;
  }
  @media (hover: none) {
    .clock-bar {
      opacity: 0.7;
    }
  }
  .cities {
    padding: 3px 11px;
    border: 1px solid var(--bg2);
    border-radius: 999px;
    font-size: 11px;
    color: var(--t1);
  }
  .cities:hover,
  .cities[aria-pressed='true'] {
    color: var(--hl1);
    border-color: var(--hl1);
  }
  .world:not(.editing) .zone-rm {
    display: none;
  }
  .seg {
    display: flex;
    border: 1px solid var(--bg2);
    border-radius: 999px;
    padding: 2px;
  }
  .seg button {
    padding: 2px 9px;
    border-radius: 999px;
    font-size: 11px;
    color: var(--t1);
  }
  .seg button:hover {
    color: var(--t2);
  }
  .seg button[aria-pressed='true'] {
    background: var(--hl1);
    color: var(--bg1);
  }
  .seg .arrow {
    padding: 2px 8px;
    font-size: 13px;
    line-height: 1;
  }
  .seg .face-name {
    min-width: 76px;
    color: var(--t2);
  }

  /* Phones stack the panes and size each frame by its content, so give the
     pane the height of its slot (72vh, less the 38px header) instead of the
     few pixels its flexible face area would collapse to. */
  @media (max-width: 720px) {
    .clock-pane {
      min-height: max(240px, calc(72vh - 38px));
    }
  }

  @media (max-width: 720px), (pointer: coarse) {
    .seg button {
      min-height: 32px;
      padding: 2px 14px;
      font-size: 12px;
    }
    .zone-row {
      grid-template-columns: 18px minmax(0, 1fr) auto 32px;
    }
    .zone-rm {
      width: 32px;
      height: 32px;
      opacity: 1;
    }
    .add-zone input {
      font-size: 16px;
      min-height: 36px;
    }
    .add-zone button {
      min-height: 36px;
    }
  }
</style>
