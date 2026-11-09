<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import { ymd } from '../../core/dates';
  import { openMention } from '../../core/mentions';
  import { inList, reminders, type Reminder } from '../../core/reminders';
  import { projects } from '../../core/tasks';
  import { activeSpace, ALL, currentSpace } from '../../core/spaces';
  import type { Config } from '../../core/types';
  import { LEVELS, periodKey, step, title, type Level } from './cal';
  import DayView from './DayView.svelte';
  import MonthView from './MonthView.svelte';
  import WeekView from './WeekView.svelte';
  import YearView from './YearView.svelte';

  export let paneId: string;
  export let focused = false;
  export let config: Config = {};
  export let updateConfig: (patch: Config) => void = () => {};
  $: void paneId;

  /* ------------------------------------------------------------- state */

  let today = ymd(new Date());
  const clock = setInterval(() => (today = ymd(new Date())), 60_000);
  onDestroy(() => clearInterval(clock));

  // Level, date and list live in the pane config, so they survive reloads.
  $: level = (LEVELS as readonly string[]).includes(config.level as string) ? (config.level as Level) : 'month';
  $: cur = typeof config.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(config.date) ? config.date : today;
  $: list = typeof config.list === 'string' ? config.list : 'all';
  $: if (list !== 'all' && !$projects.some((p) => p.id === list)) updateConfig({ list: 'all' });

  // The space chosen in the status bar wins over this pane's own pick.
  $: shownList = $activeSpace !== ALL ? $activeSpace : list;
  $: byDay = inList($reminders, shownList).reduce<Record<string, Reminder[]>>((m, r) => ((m[r.day] ??= []).push(r), m), {});
  $: viewKey = `${level}:${periodKey(level, cur)}`;
  $: levelIndex = LEVELS.indexOf(level);

  /* -------------------------------------------------------- animations */

  /**
   * One mutable object that each transition reads when it starts, so the
   * outgoing view (whose block no longer updates) still sees the direction
   * and the point the zoom happens around.
   */
  const anim: { kind: 'zoom' | 'slide' | 'none'; dir: number; origin: string } = { kind: 'none', dir: 1, origin: '50% 50%' };
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DURATION = 360;

  // Zooming in: the old view grows past the viewer and fades while the new one
  // grows into place from the point that was pinched. Zooming out is the reverse.
  function enter(_node: Element, _params?: unknown) {
    const { kind, dir, origin } = anim;
    if (kind === 'none' || reduced) return { duration: 0 };
    return {
      duration: DURATION,
      easing: cubicOut,
      css: (t: number, u: number) =>
        kind === 'zoom'
          ? `transform-origin:${origin};transform:scale(${dir > 0 ? 0.5 + 0.5 * t : 1 + 0.7 * u});opacity:${t}`
          : `transform:translateX(${dir * 56 * u}px);opacity:${t}`,
    };
  }

  function leave(_node: Element, _params?: unknown) {
    const { kind, dir, origin } = anim;
    if (kind === 'none' || reduced) return { duration: 0 };
    return {
      duration: DURATION,
      easing: cubicOut,
      css: (t: number, u: number) =>
        kind === 'zoom'
          ? `transform-origin:${origin};transform:scale(${dir > 0 ? 1 + 0.9 * u : 1 - 0.5 * u});opacity:${t}`
          : `transform:translateX(${-dir * 56 * u}px);opacity:${t}`,
    };
  }

  /* -------------------------------------------------------- navigation */

  let stage: HTMLDivElement;
  let root: HTMLDivElement;
  /** True while a transition runs, so one long pinch does not skip levels. */
  let busy = false;

  type Point = { x: number; y: number };

  /** A point (or an element's centre) as a CSS transform-origin inside the stage. */
  function originOf(el?: Element | null, point?: Point): string {
    if (!stage) return '50% 50%';
    const box = stage.getBoundingClientRect();
    let p = point;
    if (!p && el) {
      const r = el.getBoundingClientRect();
      p = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    if (!p || !box.width || !box.height) return '50% 50%';
    return `${(((p.x - box.left) / box.width) * 100).toFixed(1)}% ${(((p.y - box.top) / box.height) * 100).toFixed(1)}%`;
  }

  function go(next: Level, date: string, kind: 'zoom' | 'slide', dir: number, origin = '50% 50%') {
    if (next === level && periodKey(next, date) === periodKey(level, cur)) {
      if (date !== cur) updateConfig({ date }); // same page, just a different day picked
      return;
    }
    anim.kind = kind;
    anim.dir = dir;
    anim.origin = origin;
    busy = true;
    setTimeout(() => (busy = false), reduced ? 0 : DURATION);
    updateConfig({ level: next, date });
  }

  /** Jump to a level and date, zooming around `el` or `point`. */
  function zoomTo(next: Level, date: string, el?: Element | null, point?: Point) {
    const dir = LEVELS.indexOf(next) - levelIndex;
    if (dir) go(next, date, 'zoom', Math.sign(dir), originOf(el, point));
    else go(next, date, 'slide', Math.sign(date.localeCompare(cur)) || 1);
  }

  /** One level closer (+1) or wider (-1). Zooming in picks the date under the point. */
  function zoomStep(delta: 1 | -1, point?: Point) {
    const i = levelIndex + delta;
    if (busy || i < 0 || i >= LEVELS.length) return;
    let date = cur;
    let el: Element | null = null;
    if (delta > 0 && point) {
      const hit = document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>('[data-date]');
      if (hit && stage.contains(hit) && hit.dataset.date) {
        date = hit.dataset.date;
        el = hit;
      }
    }
    el ??= stage?.querySelector(`[data-date="${cur}"]`) ?? null;
    go(LEVELS[i], date, 'zoom', delta, point ? originOf(null, point) : originOf(el));
  }

  function move(dir: number) {
    go(level, step(level, cur, dir), 'slide', dir);
  }

  function goToday() {
    go(level, today, 'slide', Math.sign(today.localeCompare(cur)) || 1);
  }

  const openItem = (r: Reminder) => openMention(r.kind, r.id);

  /* ----------------------------------------------------------- gestures */

  // While pinching, the view follows the fingers a little before it snaps a level.
  let liveScale = 1;
  let liveOrigin = '50% 50%';
  let pinching = false;
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

  function settle() {
    pinching = false;
    liveScale = 1;
  }

  // Trackpad pinch arrives as ctrl+wheel (Chrome, Edge, Firefox); a two-finger
  // sideways swipe as a horizontal wheel.
  let wheelAcc = 0;
  let wheelIdle: ReturnType<typeof setTimeout> | undefined;
  let swipeAcc = 0;
  let swipeLocked = false;

  function onWheel(e: WheelEvent) {
    if (e.ctrlKey) {
      e.preventDefault();
      wheelAcc -= e.deltaY;
      pinching = true;
      liveOrigin = originOf(null, { x: e.clientX, y: e.clientY });
      liveScale = clamp(1 + wheelAcc / 220, 0.8, 1.25);
      if (wheelIdle) clearTimeout(wheelIdle);
      wheelIdle = setTimeout(() => {
        wheelAcc = 0;
        settle();
      }, 180);
      if (Math.abs(wheelAcc) > 55) {
        const d = wheelAcc > 0 ? 1 : -1;
        wheelAcc = 0;
        liveScale = 1;
        zoomStep(d, { x: e.clientX, y: e.clientY });
      }
      return;
    }
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 1) {
      e.preventDefault();
      if (swipeLocked) return;
      swipeAcc += e.deltaX;
      if (Math.abs(swipeAcc) > 90) {
        move(swipeAcc > 0 ? 1 : -1);
        swipeAcc = 0;
        swipeLocked = true;
        setTimeout(() => (swipeLocked = false), 500);
      }
    }
  }

  // Safari on macOS sends gesture events for a trackpad pinch instead.
  type GestureEvt = Event & { scale: number; clientX: number; clientY: number };
  let gestureBase = 1;
  function onGestureStart(e: Event) {
    e.preventDefault();
    const g = e as GestureEvt;
    gestureBase = 1;
    pinching = true;
    liveOrigin = originOf(null, { x: g.clientX, y: g.clientY });
  }
  function onGestureChange(e: Event) {
    e.preventDefault();
    const g = e as GestureEvt;
    const ratio = g.scale / gestureBase;
    liveScale = clamp(ratio, 0.8, 1.25);
    if (ratio > 1.3 || ratio < 0.77) {
      gestureBase = g.scale;
      liveScale = 1;
      zoomStep(ratio > 1 ? 1 : -1, { x: g.clientX, y: g.clientY });
    }
  }
  function onGestureEnd(e: Event) {
    e.preventDefault();
    settle();
  }

  // Touch: two fingers pinch, one finger swipes sideways for the next page.
  const touches = new Map<number, Point>();
  let pinchDist = 0;
  let swipeFrom: (Point & { t: number }) | null = null;

  const fingers = () => [...touches.values()];
  const distance = () => {
    const [a, b] = fingers();
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const middle = (): Point => {
    const [a, b] = fingers();
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType !== 'touch') return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) {
      pinchDist = distance();
      pinching = true;
      swipeFrom = null;
      liveOrigin = originOf(null, middle());
    } else if (touches.size === 1) {
      swipeFrom = { x: e.clientX, y: e.clientY, t: Date.now() };
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size !== 2 || !pinchDist) return;
    const ratio = distance() / pinchDist;
    liveOrigin = originOf(null, middle());
    liveScale = clamp(ratio, 0.75, 1.3);
    if (ratio > 1.35 || ratio < 0.74) {
      zoomStep(ratio > 1 ? 1 : -1, middle());
      pinchDist = distance();
      liveScale = 1;
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (!touches.has(e.pointerId)) return;
    touches.delete(e.pointerId);
    if (touches.size < 2 && pinchDist) {
      pinchDist = 0;
      settle();
    }
    if (swipeFrom && touches.size === 0) {
      const dx = e.clientX - swipeFrom.x;
      const dy = e.clientY - swipeFrom.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy) && Date.now() - swipeFrom.t < 700) move(dx < 0 ? 1 : -1);
      swipeFrom = null;
    }
  }

  onMount(() => {
    // Non-passive, so a pinch zooms the calendar instead of the page.
    stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('gesturestart', onGestureStart);
    stage.addEventListener('gesturechange', onGestureChange);
    stage.addEventListener('gestureend', onGestureEnd);
    return () => {
      stage.removeEventListener('wheel', onWheel);
      stage.removeEventListener('gesturestart', onGestureStart);
      stage.removeEventListener('gesturechange', onGestureChange);
      stage.removeEventListener('gestureend', onGestureEnd);
    };
  });

  /* ----------------------------------------------------------- keyboard */

  function onKey(e: KeyboardEvent) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if ((e.target as HTMLElement).closest('input, textarea, select')) return;
    const keys: Record<string, () => void> = {
      '+': () => zoomStep(1),
      '=': () => zoomStep(1),
      '-': () => zoomStep(-1),
      ArrowLeft: () => move(-1),
      ArrowRight: () => move(1),
      t: goToday,
      y: () => zoomTo('year', cur),
      m: () => zoomTo('month', cur),
      w: () => zoomTo('week', cur),
      d: () => zoomTo('day', cur),
    };
    const run = keys[e.key];
    if (!run) return;
    e.preventDefault();
    run();
  }

  let wasFocused = false;
  $: {
    if (focused && !wasFocused) root?.focus({ preventScroll: true });
    wasFocused = focused;
  }
</script>

<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
<div class="cal" bind:this={root} tabindex="0" on:keydown={onKey} aria-label="Calendar">
  <header>
    <div class="nav">
      <button on:click={() => move(-1)} aria-label="Previous {level}" title="Previous (←)">‹</button>
      <button class="today" on:click={goToday} title="Today (t)">today</button>
      <button on:click={() => move(1)} aria-label="Next {level}" title="Next (→)">›</button>
    </div>
    <div class="title-wrap">
      {#key title(level, cur)}
        <h2 in:fly={{ y: 8, duration: reduced ? 0 : 260, easing: cubicOut }}>{title(level, cur)}</h2>
      {/key}
    </div>
    <div class="levels" role="tablist" aria-label="Zoom level" style="--i:{levelIndex}">
      <span class="pill" />
      {#each LEVELS as l}
        <button role="tab" aria-selected={l === level} class:on={l === level} on:click={() => zoomTo(l, cur)} title="{l} ({l[0]})">{l}</button>
      {/each}
    </div>
    {#if $currentSpace}
      <span class="space-tag" title="Change the space in the status bar">{$currentSpace.name}</span>
    {:else}
      <select value={list} on:change={(e) => updateConfig({ list: e.currentTarget.value })} aria-label="Which space to show">
        <option value="all">all spaces</option>
        {#each $projects as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
      </select>
    {/if}
  </header>

  <div
    class="stage"
    bind:this={stage}
    on:pointerdown={onPointerDown}
    on:pointermove={onPointerMove}
    on:pointerup={onPointerUp}
    on:pointercancel={onPointerUp}
  >
    <div class="zoomer" class:settling={!pinching} style="transform:scale({liveScale});transform-origin:{liveOrigin}">
      {#key viewKey}
        <div class="view" class:scrolls={level === 'year'} in:enter out:leave>
          {#if level === 'year'}
            <YearView {cur} {today} {byDay} zoom={zoomTo} />
          {:else if level === 'month'}
            <MonthView {cur} {today} {byDay} zoom={zoomTo} {openItem} />
          {:else if level === 'week'}
            <WeekView {cur} {today} {byDay} zoom={zoomTo} {openItem} />
          {:else}
            <DayView {cur} {today} {byDay} {openItem} list={shownList} />
          {/if}
        </div>
      {/key}
    </div>
  </div>

  <footer>pinch or ctrl+scroll to zoom · swipe or ←/→ for next · + / − · y m w d</footer>
</div>

<style>
  .cal {
    height: 100%;
    display: flex;
    flex-direction: column;
    color: var(--t2);
    font-size: 13px;
    outline: none;
    overflow: hidden;
  }
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    padding: 10px 12px 8px;
  }
  .nav {
    display: flex;
    gap: 2px;
  }
  .nav button {
    min-width: 28px;
    height: 26px;
    padding: 0 6px;
    border-radius: 6px;
    color: var(--t1);
    font-size: 16px;
  }
  .nav .today {
    font-size: 12px;
    border: 1px solid var(--bg2);
  }
  .nav button:hover {
    color: var(--hl1);
    background: color-mix(in srgb, var(--bg2) 50%, transparent);
  }
  .title-wrap {
    flex: 1;
    min-width: 140px;
    overflow: hidden;
  }
  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .levels {
    position: relative;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    padding: 2px;
    border: 1px solid var(--bg2);
    border-radius: 8px;
  }
  .pill {
    position: absolute;
    top: 2px;
    bottom: 2px;
    left: 2px;
    width: calc((100% - 4px) / 4);
    border-radius: 6px;
    background: var(--hl1);
    transform: translateX(calc(var(--i) * 100%));
    transition: transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .levels button {
    position: relative;
    padding: 2px 10px;
    color: var(--t1);
    font-size: 12px;
    transition: color 200ms;
  }
  .levels button.on {
    color: var(--bg1);
    font-weight: 600;
  }
  .levels button:not(.on):hover {
    color: var(--hl1);
  }
  select {
    max-width: 140px;
    padding: 2px 4px;
    border: 1px solid var(--bg2);
    border-radius: 6px;
    background: var(--bg1);
    color: var(--t2);
    font: inherit;
    font-size: 12px;
  }
  .space-tag {
    padding: 2px 8px;
    border: 1px solid var(--hl1);
    border-radius: 6px;
    color: var(--hl1);
    font-size: 12px;
  }
  .stage {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    touch-action: pan-y;
  }
  .zoomer {
    position: absolute;
    inset: 0;
    will-change: transform;
  }
  .zoomer.settling {
    transition: transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .view {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }
  .view.scrolls {
    overflow: auto;
  }
  footer {
    padding: 4px 12px 6px;
    color: var(--t1);
    font-size: 10px;
    opacity: 0.7;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  @media (prefers-reduced-motion: reduce) {
    .pill,
    .zoomer.settling {
      transition: none;
    }
  }
</style>
