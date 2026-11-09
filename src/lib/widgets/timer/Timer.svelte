<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import type { Config } from '../../core/types';
  import {
    PRESETS, cdAdd, cdReset, cdStart, cdToggle, countdown, elapsedMs, formatAt, formatClock, formatLength, isDone, lapRows,
    now, parseDuration, remainingMsOf, stopwatch, swLap, swReset, swToggle,
  } from './engine';

  export let paneId: string;
  export let focused = false;
  export let config: Config = {};
  export let updateConfig: (patch: Config) => void = () => {};
  $: void paneId;

  type Mode = 'stopwatch' | 'countdown';
  const MODES: Mode[] = ['stopwatch', 'countdown'];
  $: mode = (config.mode === 'countdown' ? 'countdown' : 'stopwatch') as Mode;

  let root: HTMLDivElement;
  let w = 0;
  let h = 0;
  let draft = '';

  /* ------------------------------------------------------- frame clock */

  // Centiseconds need every frame; the engine's quarter-second tick is
  // enough for everything else.
  let frame = Date.now();
  let raf = 0;
  $: animate = mode === 'stopwatch' && $stopwatch.running;
  $: if (animate) startFrames();
  else stopFrames();

  function loop() {
    frame = Date.now();
    raf = document.hidden ? 0 : requestAnimationFrame(loop);
  }
  function startFrames() {
    if (!raf) loop();
  }
  function stopFrames() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  function onVisibility() {
    if (animate && !document.hidden) startFrames();
  }
  onMount(() => document.addEventListener('visibilitychange', onVisibility));
  onDestroy(() => {
    stopFrames();
    document.removeEventListener('visibilitychange', onVisibility);
  });

  /* ------------------------------------------------------------ values */

  const pad = (n: number) => String(n).padStart(2, '0');
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  $: elapsed = elapsedMs($stopwatch, Math.max(frame, $now));
  $: swMain = formatClock(elapsed);
  $: swCentis = pad(Math.floor((elapsed % 1000) / 10));
  $: laps = $stopwatch.laps;
  $: rows = lapRows(laps);
  $: lastTotal = laps.length ? laps[laps.length - 1] : 0;
  $: currentLap = elapsed - lastTotal;

  $: left = remainingMsOf($countdown, $now);
  $: done = isDone($countdown);
  $: progress = $countdown.durationMs ? clamp(1 - left / $countdown.durationMs, 0, 1) : 0;
  $: cdMain = formatClock(left, { roundUp: true });
  $: cdPrimary = $countdown.running ? 'pause' : done ? 'restart' : left < $countdown.durationMs ? 'resume' : 'start';
  $: cdLabel = $countdown.running
    ? `ends at ${formatAt($countdown.endsAt ?? Date.now())}`
    : done
      ? "time's up"
      : left < $countdown.durationMs
        ? `paused · ${formatLength($countdown.durationMs)} timer`
        : `${formatLength($countdown.durationMs)} timer`;
  $: parsed = parseDuration(draft);

  /* ------------------------------------------------------ breakpoints */

  $: tiny = w > 0 && (w < 250 || h < 190);
  $: roomy = !tiny && w >= 300 && h >= 330;
  $: showLaps = mode === 'stopwatch' && !tiny && h >= 250;
  $: showPresets = mode === 'countdown' && !tiny && h >= 240;
  $: showCustom = mode === 'countdown' && roomy;

  // How wide the readout is, in em: monospace digits are 0.6em, the
  // stopwatch's centiseconds are half size.
  $: readoutEms = mode === 'stopwatch' ? swMain.length * 0.6 + 0.95 : cdMain.length * 0.6 + 0.05;
  // Vertical room left once the tabs, buttons, laps or presets took theirs.
  $: chrome = tiny
    ? 58
    : mode === 'stopwatch'
      ? 120 + (showLaps ? Math.max(90, h * 0.42) : 0) + (roomy ? 18 : 0)
      : 132 + (showPresets ? 40 : 0) + (showCustom ? 48 : 0) + (roomy ? 18 : 0);
  $: fontSize = clamp(Math.min((w - 32) / readoutEms, (h - chrome) / 1.1), 20, 200);

  /* ----------------------------------------------------------- actions */

  function setMode(next: Mode) {
    if (next !== mode) updateConfig({ mode: next });
  }

  function primary() {
    if (mode === 'stopwatch') swToggle();
    else cdToggle();
  }

  function resetCurrent() {
    if (mode === 'stopwatch') swReset();
    else cdReset();
  }

  function startCustom() {
    if (!parsed) return;
    cdStart(parsed);
    draft = '';
  }

  function onKey(e: KeyboardEvent) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if ((e.target as HTMLElement).closest('input, textarea, select')) return;
    switch (e.code) {
      case 'Space':
        primary();
        break;
      case 'KeyL':
        if (mode !== 'stopwatch') return;
        swLap();
        break;
      case 'KeyR':
        resetCurrent();
        break;
      case 'Equal':
      case 'NumpadAdd':
        if (mode !== 'countdown') return;
        cdAdd(60_000);
        break;
      case 'Escape':
        if (!(mode === 'countdown' && done)) return;
        cdReset();
        break;
      case 'KeyS':
        setMode('stopwatch');
        break;
      case 'KeyC':
        setMode('countdown');
        break;
      default:
        return;
    }
    // also stops Space from clicking whichever button has focus
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
  class="timer-pane"
  class:bp-tiny={tiny}
  class:alarm={mode === 'countdown' && done}
  bind:this={root}
  bind:clientWidth={w}
  bind:clientHeight={h}
  tabindex="0"
  on:keydown={onKey}
>
  {#if !tiny}
    <div class="mode-tabs" role="tablist" aria-label="Timer mode">
      {#each MODES as m}
        <button role="tab" aria-selected={mode === m} class:on={mode === m} on:click={() => setMode(m)}>{m}</button>
      {/each}
    </div>
  {/if}

  {#if mode === 'stopwatch'}
    <div class="readout" class:live={$stopwatch.running} style="font-size:{fontSize}px" role="timer" aria-label="Stopwatch {swMain}">
      <span>{swMain}</span><span class="centis">.{swCentis}</span>
    </div>
    {#if !tiny}
      <p class="state-label">{$stopwatch.running ? 'running' : elapsed ? 'stopped' : 'ready'}{laps.length ? ` · lap ${laps.length + 1}` : ''}</p>
    {/if}
    <div class="controls">
      <button class="primary" on:click={swToggle}>{$stopwatch.running ? 'stop' : elapsed ? 'resume' : 'start'}</button>
      <button on:click={swLap} disabled={!$stopwatch.running}>lap</button>
      <button on:click={swReset} disabled={!elapsed && !laps.length}>reset</button>
    </div>
    {#if showLaps}
      <div class="lap-panel">
        {#if rows.length}
          <div class="lap-row lap-head" aria-hidden="true"><span>lap</span><span>split</span><span>total</span></div>
          <ol class="lap-list" aria-label="Laps">
            <li class="lap-row lap-live">
              <span class="lap-n">{rows.length + 1}</span>
              <span>{formatClock(currentLap, { centis: true })}</span>
              <span class="lap-total">{formatClock(elapsed, { centis: true })}</span>
            </li>
            {#each rows as r (r.n)}
              <li class="lap-row" class:best={r.best} class:worst={r.worst}>
                <span class="lap-n">{r.n}{#if r.best}<em class="lap-tag">best</em>{:else if r.worst}<em class="lap-tag">worst</em>{/if}</span>
                <span>{formatClock(r.lapMs, { centis: true })}</span>
                <span class="lap-total">{formatClock(r.totalMs, { centis: true })}</span>
              </li>
            {/each}
          </ol>
        {:else}
          <p class="lap-empty">{$stopwatch.running ? 'press lap (or l) to split' : 'laps show up here'}</p>
        {/if}
      </div>
    {/if}
    {#if roomy}<p class="key-hint">space start/stop · l lap · r reset</p>{/if}
  {:else}
    <div class="readout" class:live={$countdown.running} style="font-size:{fontSize}px" role="timer" aria-label="Countdown {cdMain} left">
      {cdMain}
    </div>
    <div class="meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} style="width:{clamp(fontSize * cdMain.length * 0.6, 120, 560)}px">
      <span class="meter-fill" style="width:{progress * 100}%" />
    </div>
    {#if !tiny}<p class="state-label">{cdLabel}</p>{/if}
    <div class="controls">
      <button class="primary" on:click={cdToggle}>{cdPrimary}</button>
      <button on:click={cdReset} disabled={!$countdown.running && left === $countdown.durationMs && !done}>reset</button>
      <button on:click={() => cdAdd(60_000)} title="Add a minute (+)">+1 min</button>
    </div>
    {#if showPresets}
      <div class="presets" role="group" aria-label="Presets">
        {#each PRESETS as m}
          <button class:on={$countdown.durationMs === m * 60_000} on:click={() => cdStart(m * 60_000)} title="Start a {m} minute countdown">{m}m</button>
        {/each}
      </div>
    {/if}
    {#if showCustom}
      <form class="custom" on:submit|preventDefault={startCustom}>
        <input
          bind:value={draft}
          placeholder="90s, 1:30, 5m, 1h20m"
          aria-label="Custom countdown length"
          aria-invalid={!!draft.trim() && !parsed}
          class:invalid={!!draft.trim() && !parsed}
          spellcheck="false"
          autocomplete="off"
          autocapitalize="off"
        />
        <button type="submit" disabled={!parsed}>{parsed ? `start ${formatLength(parsed)}` : 'start'}</button>
      </form>
    {/if}
    {#if roomy}<p class="key-hint">space start/pause · r reset · + add a minute</p>{/if}
  {/if}
</div>

<style>
  .timer-pane {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 12px 14px;
    overflow: hidden;
    outline: none;
    color: var(--t2);
  }
  .timer-pane.bp-tiny {
    gap: 6px;
    padding: 6px;
  }
  .timer-pane :global(*:focus:not(:focus-visible)) {
    outline: none;
  }
  .mode-tabs {
    flex: 0 0 auto;
    display: flex;
    border: 1px solid var(--bg2);
    border-radius: 999px;
    padding: 2px;
  }
  .mode-tabs button {
    padding: 2px 12px;
    border-radius: 999px;
    font-size: 12px;
    color: var(--t1);
  }
  .mode-tabs button:hover {
    color: var(--t2);
  }
  .mode-tabs button.on {
    background: var(--hl1);
    color: var(--bg1);
  }

  .readout {
    flex: 0 0 auto;
    line-height: 1.05;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em;
    white-space: nowrap;
  }
  .centis {
    font-size: 0.5em;
    color: var(--t1);
    margin-left: 0.04em;
  }
  .readout.live .centis {
    color: var(--hl1);
  }
  .state-label {
    flex: 0 0 auto;
    margin: -4px 0 0;
    font-size: 11px;
    color: var(--t1);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    text-align: center;
  }

  .meter {
    flex: 0 0 auto;
    max-width: 100%;
    height: 5px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--bg2) 70%, transparent);
    overflow: hidden;
  }
  .meter-fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--hl1);
    transition: width 0.25s linear;
  }

  .controls {
    flex: 0 0 auto;
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .controls button {
    padding: 4px 12px;
    border-radius: 6px;
    border: 1px solid var(--bg2);
    color: var(--t2);
    font-size: 12px;
    white-space: nowrap;
  }
  .controls button:hover:not(:disabled) {
    border-color: var(--hl1);
    color: var(--hl1);
  }
  .controls button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .controls .primary {
    background: var(--hl1);
    border-color: var(--hl1);
    color: var(--bg1);
    min-width: 76px;
  }
  .controls .primary:hover:not(:disabled) {
    color: var(--bg1);
    filter: brightness(1.1);
  }
  .bp-tiny .controls button {
    padding: 3px 9px;
  }
  .bp-tiny .controls .primary {
    min-width: 60px;
  }

  /* laps */
  .lap-panel {
    flex: 1 1 0;
    min-height: 0;
    width: 100%;
    max-width: 440px;
    display: flex;
    flex-direction: column;
    border-top: 1px dashed color-mix(in srgb, var(--bg2) 80%, transparent);
    padding-top: 4px;
  }
  .lap-list {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .lap-row {
    display: grid;
    grid-template-columns: minmax(64px, 1fr) 1fr 1fr;
    align-items: center;
    gap: 8px;
    padding: 3px 8px;
    border-radius: 5px;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .lap-row > span:not(:first-child) {
    text-align: right;
  }
  .lap-head {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--t1);
  }
  .lap-n {
    color: var(--t1);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .lap-total {
    color: var(--t1);
  }
  .lap-live {
    color: var(--t1);
  }
  .lap-tag {
    font-style: normal;
    font-size: 9.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 0 5px;
    border-radius: 999px;
    border: 1px solid currentColor;
  }
  .lap-row.best {
    color: var(--hl1);
    background: color-mix(in srgb, var(--hl1) 10%, transparent);
  }
  .lap-row.best .lap-n,
  .lap-row.best .lap-total {
    color: inherit;
  }
  .lap-row.worst {
    background: color-mix(in srgb, var(--bg2) 45%, transparent);
  }
  .lap-row.worst .lap-tag {
    color: var(--t1);
    border-style: dashed;
  }
  .lap-empty {
    margin: auto 0;
    text-align: center;
    font-size: 11px;
    color: var(--t1);
    opacity: 0.8;
  }

  /* countdown */
  .presets {
    flex: 0 0 auto;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 4px;
  }
  .presets button {
    min-width: 36px;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--bg2) 85%, transparent);
    font-size: 11px;
    color: var(--t1);
    font-variant-numeric: tabular-nums;
  }
  .presets button:hover {
    color: var(--hl1);
    border-color: var(--hl1);
  }
  .presets button.on {
    color: var(--t2);
    border-color: var(--t1);
  }
  .custom {
    flex: 0 0 auto;
    display: flex;
    gap: 6px;
    width: 100%;
    max-width: 300px;
  }
  .custom input {
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
  .custom input:focus {
    border-color: var(--hl1);
  }
  .custom input.invalid {
    border-style: dashed;
    border-color: var(--hl1);
  }
  .custom button {
    padding: 2px 10px;
    border-radius: 6px;
    border: 1px solid var(--bg2);
    font-size: 12px;
    color: var(--t2);
    white-space: nowrap;
  }
  .custom button:hover:not(:disabled) {
    color: var(--hl1);
    border-color: var(--hl1);
  }
  .custom button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .key-hint {
    flex: 0 0 auto;
    margin: 0;
    font-size: 10.5px;
    color: var(--t1);
    opacity: 0.8;
    text-align: center;
  }

  /* time's up: pulse a few times, then stay tinted until reset */
  .alarm {
    background: color-mix(in srgb, var(--hl1) 8%, var(--bg1));
    animation: alarm-pulse 0.55s ease-in-out 8 alternate;
  }
  .alarm .readout {
    color: var(--hl1);
  }
  @keyframes alarm-pulse {
    from {
      background: color-mix(in srgb, var(--hl1) 4%, var(--bg1));
    }
    to {
      background: color-mix(in srgb, var(--hl1) 30%, var(--bg1));
    }
  }

  @media (max-width: 720px), (pointer: coarse) {
    .mode-tabs button {
      min-height: 32px;
      padding: 2px 16px;
    }
    .controls button {
      min-height: 38px;
      padding: 4px 16px;
      font-size: 13px;
    }
    .presets button {
      min-height: 32px;
      min-width: 44px;
      font-size: 12px;
    }
    .custom input {
      font-size: 16px;
      min-height: 36px;
    }
    .custom button {
      min-height: 36px;
    }
    .key-hint {
      display: none;
    }
  }
</style>
