<script lang="ts">
  import { tick } from 'svelte';
  import type { Config } from '../../core/types';
  import Dial from './Dial.svelte';
  import { secondTick } from './ticker';
  import {
    allZones, cityName, describeZone, formatUtcOffset, isValidZone, localZone, prefers12h, resolveZone, utcOffset,
  } from './zones';

  export let paneId: string;
  export let focused = false;
  export let config: Config = {};
  export let updateConfig: (patch: Config) => void = () => {};

  type Face = 'digital' | 'analog';
  const MAX_ZONES = 24;

  $: face = (config.face === 'analog' ? 'analog' : 'digital') as Face;
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

  // Breakpoints: tiny shows only the time, medium adds the date and the face
  // switches, roomy adds world clocks and the key hint.
  $: tiny = w > 0 && (w < 240 || h < 150);
  $: roomy = !tiny && w >= 340 && h >= 320;
  $: wide = roomy && w >= 700 && w > h * 1.4;

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const pad = (n: number) => String(n).padStart(2, '0');

  $: dateSize = clamp(fw * 0.034, 11, 18);
  $: dateSpace = tiny ? 0 : dateSize * 1.4 + 10;
  // "88:88" in a monospace face is 3em wide, plus the small seconds column
  $: fontSize = clamp(Math.min((fw - 8) / 3.55, (fh - dateSpace) / 1.08), 16, 280);
  $: dialSize = clamp(Math.min(fw - 8, fh - dateSpace - 4), 48, 520);

  $: now = $secondTick;
  $: hours = now.getHours();
  $: hh = hour12 ? String(hours % 12 || 12) : pad(hours);
  $: mm = pad(now.getMinutes());
  $: ss = pad(now.getSeconds());
  $: period = hours < 12 ? 'AM' : 'PM';
  $: dateText = now.toLocaleDateString(
    undefined,
    fw < 360 ? { weekday: 'short', day: 'numeric', month: 'short' } : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  );
  $: rows = roomy ? zones.map((z) => describeZone(z, now, hour12)) : [];
  $: here = localZone();
  $: hereLabel = `${cityName(here)} · ${formatUtcOffset(utcOffset(here, now))}`;
  $: zoneOptions = roomy ? allZones() : [];

  function setFace(next: Face) {
    if (next !== face) updateConfig({ face: next });
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
  }

  function onKey(e: KeyboardEvent) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if ((e.target as HTMLElement).closest('input, textarea, select')) return;
    if (e.code === 'KeyA') setFace(face === 'analog' ? 'digital' : 'analog');
    else if (e.code === 'KeyH') setHour12(!hour12);
    else return;
    e.preventDefault();
  }

  let wasFocused = false;
  $: {
    if (focused && !wasFocused)
      tick().then(() => {
        if (root && !root.contains(document.activeElement)) root.focus({ preventScroll: true });
      });
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
  <div class="clock-body">
    <div class="face-area" bind:clientWidth={fw} bind:clientHeight={fh}>
      {#if face === 'analog'}
        <Dial size={dialSize} />
      {:else}
        <div class="readout" style="font-size:{fontSize}px" role="timer" aria-label="{hh}:{mm}:{ss}{hour12 ? ` ${period}` : ''}">
          <span class="hm">{hh}<span class="colon">:</span>{mm}</span>
          <span class="side">
            <span class="sec">{ss}</span>
            {#if hour12}<span class="period">{period}</span>{/if}
          </span>
        </div>
      {/if}
      {#if !tiny}
        <p class="date" style="font-size:{dateSize}px">{dateText}</p>
      {/if}
    </div>

    {#if roomy}
      <section class="world" aria-label="World clocks">
        <header class="world-head">
          <span>world clocks</span>
          <span class="here" title={here}>here: {hereLabel}</span>
        </header>
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
      </section>
    {/if}
  </div>

  {#if !tiny}
    <footer class="clock-bar">
      <div class="seg" role="group" aria-label="Clock face">
        <button aria-pressed={face === 'digital'} on:click={() => setFace('digital')}>digital</button>
        <button aria-pressed={face === 'analog'} on:click={() => setFace('analog')}>analog</button>
      </div>
      <div class="seg" role="group" aria-label="Hour format">
        <button aria-pressed={!hour12} on:click={() => setHour12(false)}>24h</button>
        <button aria-pressed={hour12} on:click={() => setHour12(true)}>12h</button>
      </div>
      {#if roomy}<span class="hint">a face · h 12/24h</span>{/if}
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

  /* digital readout */
  .readout {
    display: flex;
    align-items: stretch;
    line-height: 1;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }
  .colon {
    color: var(--hl1);
    margin: 0 -0.04em;
    position: relative;
    top: -0.05em;
  }
  .side {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    margin-left: 0.08em;
    padding: 0.13em 0 0.1em;
  }
  .sec {
    font-size: 0.34em;
    color: var(--hl1);
    letter-spacing: 0;
  }
  .period {
    font-size: 0.17em;
    font-weight: 600;
    letter-spacing: 0.12em;
    color: var(--t1);
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

  /* footer */
  .clock-bar {
    flex: 0 0 auto;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px 10px;
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
  .hint {
    font-size: 10.5px;
    color: var(--t1);
    opacity: 0.8;
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
    .hint {
      display: none;
    }
  }
</style>
