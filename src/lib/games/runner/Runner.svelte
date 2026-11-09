<script context="module" lang="ts">
  import { persisted } from '../../core/storage';

  /** Longest run in metres, shared by every runner pane; drawn as a "best" marker. */
  const bestMetres = persisted<number>('games-action:runner-best-m', 0);
</script>

<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { get } from 'svelte/store';
  import type { GameApi } from '../../core/types';
  import { clamp, fitCanvas, heldKeys, readPalette, startLoop, watchPalette, type Palette } from '../kit';
  import { drawRunner, type View } from './draw';
  import { RunnerWorld, VH, VIEW, VW } from './world';

  export let paused = true;
  export let api: GameApi;

  /** A press waits this long (s) before it jumps, in case it turns into a swipe. */
  const TAP_WAIT = 0.07;
  const SWIPE_PX = 14;
  /** A quick swipe down still ducks for this long (s) on the ground, enough to pass a packet. */
  const SWIPE_DUCK = 0.45;

  const world = new RunnerWorld(
    {
      sfx: (kind) => api.sfx(kind),
      score: (n) => api.setScore(n),
      over: (score, message, metres) => {
        if (metres > get(bestMetres)) bestMetres.set(metres);
        api.gameOver(score, message);
      },
    },
    get(bestMetres),
  );

  const keys = heldKeys(api, (k, e) => {
    if (k === 'up' || k === 'KeyJ') {
      e.preventDefault();
      world.pressJump();
    }
  });

  /* ------------------------------------------- tap = jump, swipe down = duck */

  interface Gesture {
    id: number;
    y0: number;
    wait: number;
    mode: 'pending' | 'jump' | 'duck';
  }
  let gesture: Gesture | null = null;
  /** Seconds of duck left from the last swipe. */
  let swipeDuck = 0;

  function onPointerDown(e: PointerEvent) {
    if (paused || gesture || e.button > 0) return;
    stage.setPointerCapture?.(e.pointerId);
    gesture = { id: e.pointerId, y0: e.clientY, wait: TAP_WAIT, mode: 'pending' };
  }

  function onPointerMove(e: PointerEvent) {
    if (!gesture || e.pointerId !== gesture.id || gesture.mode === 'duck') return;
    if (e.clientY - gesture.y0 >= SWIPE_PX) {
      gesture.mode = 'duck';
      swipeDuck = SWIPE_DUCK;
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (!gesture || e.pointerId !== gesture.id) return;
    if (gesture.mode === 'pending' && !paused) world.pressJump(); // a quick tap: short hop
    gesture = null;
  }

  /* ------------------------------------------------------------ loop */

  /** Game time in ms for animations (blinks, legs, bobbing); it stops while paused. */
  let clock = 0;

  function update(dt: number) {
    clock += dt * 1000;
    if (gesture?.mode === 'pending' && (gesture.wait -= dt) <= 0) {
      gesture.mode = 'jump';
      world.pressJump();
    }
    // a swipe in the air fast-falls first; the duck time only runs once on the ground
    if (world.hero.grounded) swipeDuck = Math.max(0, swipeDuck - dt);
    world.update(dt, {
      jumpHeld: keys.has('up') || keys.has('KeyJ') || gesture?.mode === 'jump',
      duck: keys.has('down') || gesture?.mode === 'duck' || swipeDuck > 0,
    });
  }

  let canvas: HTMLCanvasElement;
  let stage: HTMLDivElement;
  let w = 0;
  let h = 0;
  let ctx: CanvasRenderingContext2D | null = null;
  let pal: Palette | null = null;
  /** Canvas size in virtual px, following the stage's shape (see VIEW). */
  function viewFor(cw: number, ch: number): View {
    if (!cw || !ch) return { w: VW, h: VH, scale: 3 };
    const vw = clamp(Math.round((VH * cw) / ch), VW, VIEW.maxW);
    const vh = clamp(Math.round((VW * ch) / cw), VH, VIEW.maxH);
    return { w: vw, h: vh, scale: Math.min(cw / vw, ch / vh) };
  }
  $: view = viewFor(w, h);
  $: if (canvas && w && h) ctx = fitCanvas(canvas, w, h, view.w, view.h);
  $: if (paused) {
    keys.clear();
    gesture = null;
    swipeDuck = 0;
  }

  function draw() {
    if (ctx && pal) drawRunner(ctx, world, pal, clock, view);
  }

  let stopLoop: (() => void) | undefined;
  let stopPal: (() => void) | undefined;
  onMount(() => {
    pal = readPalette(stage);
    stopPal = watchPalette(stage, (p) => (pal = p));
    stopLoop = startLoop(update, draw, () => paused || world.over);
  });
  onDestroy(() => {
    stopLoop?.();
    stopPal?.();
    keys.stop();
  });
</script>

<div
  class="runner-stage"
  bind:this={stage}
  bind:clientWidth={w}
  bind:clientHeight={h}
  on:pointerdown={onPointerDown}
  on:pointermove={onPointerMove}
  on:pointerup={onPointerUp}
  on:pointercancel={() => (gesture = null)}
  on:contextmenu|preventDefault
>
  <canvas bind:this={canvas} />
</div>

<style>
  .runner-stage {
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
