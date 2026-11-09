<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { secondTick } from './ticker';

  /**
   * A quiet 12-hour dial: twelve hour marks, thin hands and a fine second
   * hand in the accent colour. No numerals, no minute ticks.
   */

  /** Diameter in px. */
  export let size = 200;

  const C = 100;
  const HOURS = Array.from({ length: 12 }, (_, i) => i);

  let t = Date.now();
  let raf = 0;
  let stopTick = () => {};
  // the second hand sweeps; with reduced motion it steps once per second
  let smooth = true;

  function loop() {
    t = Date.now();
    raf = document.hidden ? 0 : requestAnimationFrame(loop);
  }
  function onVisibility() {
    if (smooth && !document.hidden && !raf) loop();
  }

  onMount(() => {
    smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (smooth) {
      loop();
      document.addEventListener('visibilitychange', onVisibility);
    } else stopTick = secondTick.subscribe((d) => (t = d.getTime()));
  });

  onDestroy(() => {
    if (raf) cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVisibility);
    stopTick();
  });

  $: d = new Date(t);
  $: seconds = d.getSeconds() + (smooth ? d.getMilliseconds() / 1000 : 0);
  $: minutes = d.getMinutes() + seconds / 60;
  $: hours = (d.getHours() % 12) + minutes / 60;
  // the label only changes once a minute, so do not format it every frame
  $: minute = Math.floor(t / 60_000);
  $: label = new Date(minute * 60_000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
</script>

<svg class="dial-face" viewBox="0 0 200 200" width={size} height={size} role="img" aria-label="Analog clock {label}">
  <circle class="plate" cx={C} cy={C} r="96" />
  {#each HOURS as i}
    <line class="mark" class:mark-q={i % 3 === 0} x1={C} y1="12" x2={C} y2={i % 3 === 0 ? 24 : 19} transform="rotate({i * 30} {C} {C})" />
  {/each}
  <line class="hand-hour" x1={C} y1="108" x2={C} y2="56" transform="rotate({hours * 30} {C} {C})" />
  <line class="hand-minute" x1={C} y1="110" x2={C} y2="30" transform="rotate({minutes * 6} {C} {C})" />
  <line class="hand-second" x1={C} y1="116" x2={C} y2="22" transform="rotate({seconds * 6} {C} {C})" />
  <circle class="hub" cx={C} cy={C} r="2.6" />
</svg>

<style>
  .dial-face {
    display: block;
    flex-shrink: 0;
    overflow: visible;
  }
  .plate {
    fill: none;
    stroke: color-mix(in srgb, var(--bg2) 85%, transparent);
    stroke-width: 1;
  }
  .mark {
    stroke: color-mix(in srgb, var(--t1) 55%, transparent);
    stroke-width: 1.4;
    stroke-linecap: round;
  }
  .mark-q {
    stroke: var(--t1);
    stroke-width: 1.8;
  }
  .hand-hour,
  .hand-minute {
    stroke: var(--t2);
    stroke-linecap: round;
  }
  .hand-hour {
    stroke-width: 3.2;
  }
  .hand-minute {
    stroke-width: 2;
  }
  .hand-second {
    stroke: var(--hl1);
    stroke-width: 0.9;
    stroke-linecap: round;
  }
  .hub {
    fill: var(--hl1);
  }
</style>
