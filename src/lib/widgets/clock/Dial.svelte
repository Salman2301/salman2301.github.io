<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { secondTick } from './ticker';

  /** Diameter in px. */
  export let size = 200;
  /**
   * 24-hour face: the hour hand goes round once a day, with 24 / 6 / 12 / 18
   * at the quarters and a dot for every hour. The 12-hour face shows AM / PM.
   */
  export let hour24 = false;

  const C = 100;
  const TICKS = Array.from({ length: 60 }, (_, i) => i);
  const HOURS24 = Array.from({ length: 24 }, (_, i) => i);
  const quarters = (labels: number[]) => [
    { n: labels[0], x: C, y: 36 },
    { n: labels[1], x: 164, y: C },
    { n: labels[2], x: C, y: 164 },
    { n: labels[3], x: 36, y: C },
  ];
  $: NUMERALS = hour24 ? quarters([24, 6, 12, 18]) : quarters([12, 3, 6, 9]);

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
  $: hours = hour24 ? d.getHours() + minutes / 60 : (d.getHours() % 12) + minutes / 60;
  // one turn is 12 hours, or 24 on the 24-hour face
  $: hourDeg = hours * (hour24 ? 15 : 30);
  $: period = d.getHours() < 12 ? 'AM' : 'PM';
  $: numerals = size >= 150;
  // the label only changes once a minute, so do not format it every frame
  $: minute = Math.floor(t / 60_000);
  $: label = new Date(minute * 60_000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !hour24 });
</script>

<svg class="dial-face" viewBox="0 0 200 200" width={size} height={size} role="img" aria-label="Analog clock {label}">
  <circle class="plate" cx={C} cy={C} r="96" />
  {#each TICKS as i}
    <line class="mark" class:mark-hour={i % 5 === 0} x1={C} y1="9" x2={C} y2={i % 5 === 0 ? 21 : 14} transform="rotate({i * 6} {C} {C})" />
  {/each}
  {#if hour24}
    {#each HOURS24 as i}
      <circle class="hour-dot" class:hour-dot-q={i % 6 === 0} cx={C} cy="50" r={i % 6 === 0 ? 2.2 : 1.4} transform="rotate({i * 15} {C} {C})" />
    {/each}
  {/if}
  {#if numerals}
    {#each NUMERALS as m}
      <text class="numeral" x={m.x} y={m.y} text-anchor="middle" dominant-baseline="central">{m.n}</text>
    {/each}
    <text class="period" x={C} y="134" text-anchor="middle" dominant-baseline="central">{hour24 ? '24h' : period}</text>
  {/if}
  <line class="hand-hour" x1={C} y1="112" x2={C} y2="54" transform="rotate({hourDeg} {C} {C})" />
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
  .period {
    fill: var(--t1);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1em;
  }
  .hour-dot {
    fill: color-mix(in srgb, var(--t1) 70%, transparent);
  }
  .hour-dot-q {
    fill: var(--hl1);
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
