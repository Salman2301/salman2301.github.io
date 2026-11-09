<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import type { Config } from '../../core/types';
  import { readPalette, watchPalette } from '../../games/kit';
  import { Rain } from './rain';
  import { CHARSET_IDS, CHARSETS, DENSITY, SPEED, formatFactor, nextCharset, readSettings, snap, type Charset, type Range } from './settings';

  export let paneId: string;
  export let focused = false;
  export let config: Config = {};
  export let updateConfig: (patch: Config) => void = () => {};
  $: void paneId;

  const SAMPLE: Record<Charset, string> = { katakana: 'ｱｲｳ', binary: '01', code: '{;}', hex: '0xF' };
  const IDLE_MS = 2500;
  const RESUME_HINT = window.matchMedia('(hover: none)').matches ? 'paused · tap to resume' : 'paused · click to resume';

  let root: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let rain: Rain | null = null;
  let w = 0;
  let h = 0;

  let paused = false;
  let pageHidden = document.hidden;
  let inView = true;
  let reduced = false;
  /** Controls stay open while pinned (the icon button); `awake` follows recent mouse or keyboard use. */
  let pinned = false;
  let awake = false;
  let osd = '';

  $: settings = readSettings(config);
  $: rain?.setOptions(settings);
  $: rain?.setReducedMotion(reduced);
  $: running = !paused && !pageHidden && inView;
  $: if (rain) {
    if (running) rain.play();
    else rain.stop();
  }
  // Small panes collapse the controls into an icon that opens a card.
  $: compact = w < 440 || h < 190;
  $: tiny = h < 170;
  $: revealed = pinned || awake;

  /* ------------------------------------------------------------ actions */

  function togglePause() {
    paused = !paused;
  }

  function setCharset(charset: Charset) {
    updateConfig({ charset });
  }

  function setFactor(key: 'speed' | 'density', range: Range, value: number) {
    updateConfig({ [key]: snap(value, range, 1) });
  }

  function nudge(key: 'speed' | 'density', range: Range, steps: number) {
    const next = snap(settings[key] + steps * range.step, range, 1);
    setFactor(key, range, next);
    flash(`${key} ${formatFactor(next)}`);
  }

  let osdTimer: ReturnType<typeof setTimeout> | undefined;
  function flash(text: string) {
    osd = text;
    clearTimeout(osdTimer);
    osdTimer = setTimeout(() => (osd = ''), 1100);
  }

  /* --------------------------------------------- showing the controls */

  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  function poke() {
    awake = true;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => (awake = false), IDLE_MS);
  }

  // Touch has no hover: taps never reveal the controls, the icon does.
  function onPointerMove(e: PointerEvent) {
    if (e.pointerType !== 'touch') poke();
  }

  function onPointerLeave(e: PointerEvent) {
    if (e.pointerType === 'touch') return;
    clearTimeout(idleTimer);
    awake = false;
  }

  function onFocusIn(e: FocusEvent) {
    if ((e.target as Element).matches(':focus-visible')) poke();
  }

  /* ------------------------------------------------------ canvas click */

  // A click that only focused the pane should not also pause the rain.
  let focusedAt = 0;
  let downAt = 0;
  $: focusedAt = focused ? performance.now() : 0;

  function onCanvasClick() {
    if (compact && pinned) {
      pinned = false;
      return;
    }
    if (focusedAt >= downAt) return;
    togglePause();
  }

  /* ----------------------------------------------------------- keyboard */

  function onKey(e: KeyboardEvent) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.code === 'Escape' && pinned) {
      e.preventDefault();
      pinned = false;
      root.focus({ preventScroll: true });
      return;
    }
    if (e.target !== root) return;
    if (handleKey(e.code, e.shiftKey)) {
      e.preventDefault();
      poke();
    }
  }

  function handleKey(code: string, shift: boolean): boolean {
    switch (code) {
      case 'Space':
        togglePause();
        return true;
      case 'KeyC': {
        const next = nextCharset(settings.charset, shift ? -1 : 1);
        setCharset(next);
        flash(`glyphs: ${CHARSETS[next].title}`);
        return true;
      }
      case 'KeyS':
        pinned = !pinned;
        return true;
      case 'ArrowUp':
      case 'ArrowDown':
        nudge('speed', SPEED, code === 'ArrowUp' ? 1 : -1);
        return true;
      case 'ArrowRight':
      case 'ArrowLeft':
        nudge('density', DENSITY, code === 'ArrowRight' ? 1 : -1);
        return true;
    }
    return false;
  }

  let wasFocused = false;
  $: {
    if (focused && !wasFocused) tick().then(() => root?.focus({ preventScroll: true }));
    wasFocused = focused;
  }

  /* ---------------------------------------------------------- lifecycle */

  const cleanups: (() => void)[] = [];

  onMount(() => {
    const engine = new Rain(canvas);
    engine.setPalette(readPalette(root));
    engine.setOptions(settings);
    const box = root.getBoundingClientRect();
    w = box.width;
    h = box.height;
    engine.resize(box.width, box.height);
    rain = engine;

    const resizer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      w = width;
      h = height;
      engine.resize(width, height);
    });
    resizer.observe(root);

    const viewport = new IntersectionObserver(([entry]) => (inView = entry.isIntersecting));
    viewport.observe(root);

    const onVisibility = () => (pageHidden = document.hidden);
    document.addEventListener('visibilitychange', onVisibility);

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion = () => (reduced = motion.matches);
    onMotion();
    motion.addEventListener('change', onMotion);

    const stopPalette = watchPalette(root, (p) => rain?.setPalette(p));

    // Glyphs drawn before the web font arrived use a fallback; redraw once it is in.
    document.fonts?.ready.then(() => rain?.setPalette(readPalette(root)));

    cleanups.push(
      () => resizer.disconnect(),
      () => viewport.disconnect(),
      () => document.removeEventListener('visibilitychange', onVisibility),
      () => motion.removeEventListener('change', onMotion),
      stopPalette,
    );
  });

  onDestroy(() => {
    cleanups.forEach((fn) => fn());
    clearTimeout(idleTimer);
    clearTimeout(osdTimer);
    rain?.destroy();
    rain = null;
  });

  const value = (e: Event) => Number((e.currentTarget as HTMLInputElement).value);
</script>

<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
<div
  class="rain"
  class:revealed
  class:compact
  class:tiny
  class:pinned
  bind:this={root}
  tabindex="0"
  role="group"
  aria-label="Digital rain. Space pauses, C changes glyphs, arrows change speed and density, S shows settings."
  on:keydown={onKey}
  on:pointermove={onPointerMove}
  on:pointerdown={onPointerMove}
  on:pointerleave={onPointerLeave}
  on:focusin={onFocusIn}
>
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <canvas
    bind:this={canvas}
    aria-hidden="true"
    on:pointerdown={(e) => (downAt = e.timeStamp)}
    on:click={onCanvasClick}
  />

  {#if paused}
    <button class="badge" on:click={togglePause} title="Resume (space)">
      <span class="badge-icon" aria-hidden="true" />{tiny ? 'paused' : RESUME_HINT}
    </button>
  {/if}

  {#if osd}<div class="osd" aria-live="polite">{osd}</div>{/if}

  <button class="toggle" class:on={pinned} aria-label="Rain settings" aria-expanded={pinned} title="Settings (s)" on:click={() => (pinned = !pinned)}>
    {#if pinned && compact}
      <svg viewBox="0 0 16 16" aria-hidden="true"><line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" /></svg>
    {:else}
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <line x1="2" y1="5" x2="14" y2="5" /><circle cx="10.5" cy="5" r="1.9" />
        <line x1="2" y1="11" x2="14" y2="11" /><circle cx="5.5" cy="11" r="1.9" />
      </svg>
    {/if}
  </button>

  {#if !compact || pinned}
    <div class="panel" class:card={compact} role="group" aria-label="Rain settings">
      <div class="panel-head">
        <button class="play" aria-label={paused ? 'Resume' : 'Pause'} title="{paused ? 'Resume' : 'Pause'} (space)" on:click={togglePause}>
          <span class="play-icon" class:paused aria-hidden="true" />
        </button>
        {#if compact}<span class="panel-title">digital rain</span>{/if}
      </div>
      <div class="seg" role="radiogroup" aria-label="Glyphs">
        {#if !compact}<span class="name">glyphs</span>{/if}
        {#each CHARSET_IDS as id (id)}
          <button role="radio" aria-checked={settings.charset === id} class:on={settings.charset === id} title={CHARSETS[id].title} on:click={() => setCharset(id)}>
            {SAMPLE[id]}
          </button>
        {/each}
      </div>
      <label class="slide">
        <span class="name">speed</span>
        <input type="range" min={SPEED.min} max={SPEED.max} step={SPEED.step} value={settings.speed} on:input={(e) => setFactor('speed', SPEED, value(e))} />
        <span class="num">{formatFactor(settings.speed)}</span>
      </label>
      <label class="slide">
        <span class="name">density</span>
        <input type="range" min={DENSITY.min} max={DENSITY.max} step={DENSITY.step} value={settings.density} on:input={(e) => setFactor('density', DENSITY, value(e))} />
        <span class="num">{formatFactor(settings.density)}</span>
      </label>
    </div>
  {/if}
</div>

<style>
  .rain {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--bg1);
    outline: none;
    color: var(--t2);
    font-size: 12px;
    -webkit-tap-highlight-color: transparent;
  }
  canvas {
    position: absolute;
    left: 0;
    top: 0;
    display: block;
    width: 100%;
    height: 100%;
    touch-action: manipulation;
  }
  .rain:not(.revealed) canvas {
    cursor: none;
  }
  .rain :global(*:focus:not(:focus-visible)) {
    outline: none;
  }

  /* shared chrome for everything floating over the rain */
  .toggle,
  .panel,
  .badge,
  .osd {
    position: absolute;
    border: 1px solid color-mix(in srgb, var(--bg2) 90%, transparent);
    background: color-mix(in srgb, var(--bg1) 84%, transparent);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    box-shadow: 0 8px 24px -12px rgba(0, 0, 0, 0.5);
  }

  .toggle {
    top: 6px;
    right: 6px;
    z-index: 3;
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: 7px;
    color: var(--t1);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s, color 0.15s, border-color 0.15s;
  }
  .revealed .toggle,
  .toggle:hover,
  .toggle:focus-visible {
    opacity: 1;
    pointer-events: auto;
  }
  .toggle:hover,
  .toggle.on {
    color: var(--hl1);
    border-color: var(--hl1);
  }
  .toggle svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
  }
  .toggle circle {
    fill: var(--bg1);
  }

  .panel {
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 6px 12px;
    padding: 5px 10px 5px 6px;
    border-radius: 10px;
  }
  /* wide panes: a bar along the bottom that shows on hover or keyboard focus */
  .panel:not(.card) {
    left: 50%;
    bottom: 10px;
    max-width: calc(100% - 20px);
    width: max-content;
    flex-wrap: wrap;
    justify-content: center;
    transform: translate(-50%, 8px);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s, transform 0.2s;
  }
  .revealed .panel:not(.card),
  .panel:not(.card):hover,
  .panel:not(.card):focus-within {
    opacity: 1;
    transform: translate(-50%, 0);
    pointer-events: auto;
  }
  /* small panes: a card under the icon, scrolling when the pane is tiny */
  .panel.card {
    top: 6px;
    right: 6px;
    width: min(236px, calc(100% - 12px));
    max-height: calc(100% - 12px);
    overflow: auto;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    padding: 0 8px 8px;
  }
  .tiny .panel.card {
    gap: 3px;
    padding-bottom: 5px;
  }
  .panel-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .card .panel-head {
    min-height: 28px;
    padding-right: 28px;
  }
  .panel-title {
    color: var(--t1);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .name {
    color: var(--t1);
    font-size: 11px;
  }
  .seg {
    display: flex;
    align-items: center;
    gap: 3px;
  }
  .seg .name {
    margin-right: 5px;
  }
  .card .seg {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
  }
  .seg button,
  .play {
    min-height: 24px;
    padding: 0 7px;
    border-radius: 6px;
    border: 1px solid var(--bg2);
    color: var(--t1);
    white-space: nowrap;
  }
  .seg button:hover,
  .play:hover {
    color: var(--t2);
    border-color: var(--t1);
  }
  .seg button.on {
    color: var(--bg1);
    background: var(--hl1);
    border-color: var(--hl1);
  }
  .play {
    width: 26px;
    height: 26px;
    padding: 0;
    display: grid;
    place-items: center;
    color: var(--hl1);
  }
  .card .play {
    width: 24px;
    height: 22px;
    min-height: 0;
  }
  .play-icon {
    width: 9px;
    height: 10px;
    border-left: 3px solid currentColor;
    border-right: 3px solid currentColor;
  }
  .play-icon.paused {
    width: 0;
    height: 0;
    margin-left: 2px;
    border-right: 0;
    border-left: 8px solid currentColor;
    border-top: 5px solid transparent;
    border-bottom: 5px solid transparent;
  }
  .slide {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 24px;
  }
  .card .slide .name {
    width: 50px;
    flex-shrink: 0;
  }
  .slide input {
    width: 72px;
    min-width: 0;
    margin: 0;
    accent-color: var(--hl1);
    cursor: pointer;
  }
  .card .slide input {
    flex: 1;
    width: auto;
  }
  .num {
    min-width: 4ch;
    text-align: right;
    color: var(--t2);
    font-variant-numeric: tabular-nums;
  }

  .badge {
    top: 6px;
    left: 6px;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 28px;
    padding: 0 10px;
    border-radius: 7px;
    color: var(--t2);
    font-size: 11px;
  }
  .badge:hover {
    border-color: var(--hl1);
  }
  .badge-icon {
    width: 8px;
    height: 9px;
    border-left: 3px solid var(--hl1);
    border-right: 3px solid var(--hl1);
  }

  .osd {
    left: 50%;
    top: 50%;
    z-index: 2;
    transform: translate(-50%, -50%);
    max-width: calc(100% - 24px);
    padding: 6px 12px;
    border-radius: 8px;
    color: var(--t2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
  }

  /*
   * Stacked phone layout: the pane is only as tall as its content (the cell
   * has a 72vh min-height), and an absolutely placed canvas has none. Fill the
   * cell minus the pane header so the rain does not collapse to 0px.
   */
  @media (max-width: 720px) {
    .rain {
      min-height: max(150px, calc(72vh - 40px));
    }
  }

  /* touch: the icon is always there, and everything is big enough to hit */
  @media (hover: none) {
    .toggle {
      opacity: 0.75;
      pointer-events: auto;
    }
  }
  @media (pointer: coarse) {
    .toggle,
    .badge {
      height: 34px;
    }
    .toggle,
    .play,
    .card .play {
      width: 34px;
      height: 34px;
    }
    .seg button,
    .slide {
      min-height: 34px;
    }
    .card .panel-head {
      min-height: 34px;
      padding-right: 34px;
    }
  }
</style>
