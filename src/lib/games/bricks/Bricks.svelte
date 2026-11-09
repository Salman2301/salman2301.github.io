<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { GameApi } from '../../core/types';
  import { clamp, fitCanvas, heldKeys, readPalette, startLoop, watchPalette, type Palette } from '../kit';
  import { drawBricks } from './draw';
  import { BricksGame, MAX_VH, MIN_VH, VW } from './engine';

  export let paused = true;
  export let api: GameApi;

  /** A press shorter and stiller than this is a tap (launch / fire), not a drag. */
  const TAP_MS = 250;
  const TAP_PX = 8;

  const game = new BricksGame({
    sfx: (kind) => api.sfx(kind),
    score: (n) => api.setScore(n),
    over: (score, message) => api.gameOver(score, message),
  });

  const keys = heldKeys(api, (k, e) => {
    if (k === 'up' || k === 'Enter') {
      e.preventDefault();
      game.launch();
    } else if (k === 'KeyJ') e.preventDefault();
  });

  /* ------------------------------------------------- pointer and touch */

  interface Drag {
    id: number;
    x0: number;
    y0: number;
    t0: number;
    /** Pointer x in virtual px. */
    x: number;
    /** Becomes true once the press moves or is held: then the paddle follows it. */
    active: boolean;
  }
  let drag: Drag | null = null;

  /** Pointer x in virtual px; presses beside a letterboxed canvas still steer. */
  function virtualX(e: PointerEvent): number {
    const r = canvas.getBoundingClientRect();
    return clamp(((e.clientX - r.left) / Math.max(1, r.width)) * VW, 0, VW);
  }

  function onPointerDown(e: PointerEvent) {
    if (paused || drag || e.button > 0) return;
    stage.setPointerCapture?.(e.pointerId);
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), x: virtualX(e), active: false };
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return;
    drag.x = virtualX(e);
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) >= TAP_PX) drag.active = true;
  }

  function onPointerUp(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return;
    const tap = !drag.active && performance.now() - drag.t0 < TAP_MS;
    drag = null;
    if (tap && !paused) game.tap();
  }

  /* ------------------------------------------------------------ loop */

  /** Game time in ms for animations (capsule blink, launch hint, shake); it stops while paused. */
  let clock = 0;

  function update(dt: number) {
    clock += dt * 1000;
    if (drag && !drag.active && performance.now() - drag.t0 >= TAP_MS) drag.active = true;
    const dir = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
    game.update(dt, { dir, targetX: drag?.active ? drag.x : null, fire: keys.has('KeyJ') });
  }

  let canvas: HTMLCanvasElement;
  let stage: HTMLDivElement;
  let w = 0;
  let h = 0;
  let ctx: CanvasRenderingContext2D | null = null;
  let pal: Palette | null = null;
  /** Field height that matches the stage's shape, within the engine's limits. */
  $: vh = w && h ? clamp(Math.round((VW * h) / w), MIN_VH, MAX_VH) : MIN_VH;
  $: game.resize(vh);
  $: if (canvas && w && h) ctx = fitCanvas(canvas, w, h, VW, vh);
  /** CSS px per virtual px, so the HUD can keep its text readable in small panes. */
  $: scale = w && h ? Math.min(w / VW, h / vh) : 3;
  $: if (paused) {
    keys.clear();
    drag = null;
  }

  function draw() {
    if (ctx && pal) drawBricks(ctx, game, pal, clock, scale);
  }

  let stopLoop: (() => void) | undefined;
  let stopPal: (() => void) | undefined;
  onMount(() => {
    pal = readPalette(stage);
    stopPal = watchPalette(stage, (p) => (pal = p));
    stopLoop = startLoop(update, draw, () => paused || game.over);
  });
  onDestroy(() => {
    stopLoop?.();
    stopPal?.();
    keys.stop();
  });
</script>

<div
  class="bricks-stage"
  bind:this={stage}
  bind:clientWidth={w}
  bind:clientHeight={h}
  on:pointerdown={onPointerDown}
  on:pointermove={onPointerMove}
  on:pointerup={onPointerUp}
  on:pointercancel={() => (drag = null)}
  on:contextmenu|preventDefault
>
  <canvas bind:this={canvas} />
</div>

<style>
  .bricks-stage {
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    overflow: hidden;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
</style>
