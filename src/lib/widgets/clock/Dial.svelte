<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { secondTick } from './ticker';

  /** Diameter in px. */
  export let size = 200;

  const C = 100;
  const TICKS = Array.from({ length: 60 }, (_, i) => i);
  const NUMERALS = [
    { n: 12, x: C, y: 36 },
    { n: 3, x: 164, y: C },
    { n: 6, x: C, y: 164 },
    { n: 9, x: 36, y: C },
  ];

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
  $: numerals = size >= 150;
</script>

<svg class="dial-face" viewBox="0 0 200 200" width={size} height={size} role="img" aria-label="Analog clock {d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}">
  <circle class="plate" cx={C} cy={C} r="96" />
  {#each TICKS as i}
    <line class="mark" class:mark-hour={i % 5 === 0} x1={C} y1="9" x2={C} y2={i % 5 === 0 ? 21 : 14} transform="rotate({i * 6} {C} {C})" />
  {/each}
  {#if numerals}
    {#each NUMERALS as m}
      <text class="numeral" x={m.x} y={m.y} text-anchor="middle" dominant-baseline="central">{m.n}</text>
    {/each}
  {/if}
  <line class="hand-hour" x1={C} y1="112" x2={C} y2="54" transform="rotate({hours * 30} {C} {C})" />
  <line class="hand-minute" x1={C} y1="116" x2={C} y2="28" transform="rotate({minutes * 6} {C} {C})" />
  <g transform="rotate({seconds * 6} {C} {C})">
    <line class="hand-second" x1={C} y1="126" x2={C} y2="18" />
    <circle class="hand-second-tail" cx={C} cy="120" r="3.2" />
  </g>
  <circle class="hub" cx={C} cy={C} r="5" />
  <circle class="hub-dot" cx={C} cy={C} r="1.8" />
</svg>

<style>
  .dial-face {
    display: block;
    flex-shrink: 0;
    overflow: visible;
  }
  .plate {
    fill: color-mix(in srgb, var(--bg2) 22%, var(--bg1));
    stroke: color-mix(in srgb, var(--bg2) 90%, var(--t1));
    stroke-width: 1.5;
  }
  .mark {
    stroke: color-mix(in srgb, var(--t1) 55%, transparent);
    stroke-width: 1;
    stroke-linecap: round;
  }
  .mark-hour {
    stroke: var(--t2);
    stroke-width: 2.6;
  }
  .numeral {
    fill: var(--t1);
    font-size: 15px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .hand-hour,
  .hand-minute {
    stroke: var(--t2);
    stroke-linecap: round;
  }
  .hand-hour {
    stroke-width: 6.5;
  }
  .hand-minute {
    stroke-width: 4;
  }
  .hand-second {
    stroke: var(--hl1);
    stroke-width: 1.6;
    stroke-linecap: round;
  }
  .hand-second-tail,
  .hub {
    fill: var(--hl1);
  }
  .hub-dot {
    fill: var(--bg1);
  }
</style>
