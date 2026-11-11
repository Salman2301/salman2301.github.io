<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { secondTick } from './ticker';

  /**
   * Every analog face, drawn in one 200 x 200 SVG. They share the hands'
   * timing: the second hand sweeps (it steps once a second with reduced
   * motion, and in the small previews of the gallery).
   */

  /** A face id of kind "analog" from faces.ts. */
  export let face = 'analog';
  /** Diameter in px. */
  export let size = 200;
  /** A gallery thumbnail: step once a second instead of animating. */
  export let preview = false;

  const C = 100;
  const range = (n: number) => Array.from({ length: n }, (_, i) => i);
  const HOURS = range(12);
  const MINUTES = range(60);
  const ROMAN = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  const WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  let t = Date.now();
  let raf = 0;
  let stopTick = () => {};
  let smooth = true;

  function loop() {
    t = Date.now();
    raf = document.hidden ? 0 : requestAnimationFrame(loop);
  }
  function onVisibility() {
    if (smooth && !document.hidden && !raf) loop();
  }

  onMount(() => {
    smooth = !preview && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
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
  $: hours24 = d.getHours() + minutes / 60;
  $: hours = hours24 % 12;
  $: sDeg = seconds * 6;
  $: mDeg = minutes * 6;
  $: hDeg = hours * 30;
  // the label only changes once a minute, so do not format it every frame
  $: minute = Math.floor(t / 60_000);
  $: label = new Date(minute * 60_000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  $: dayOfMonth = d.getDate();
  $: weekday = d.getDay();

  /** A point `r` from the centre at `deg` clockwise from 12. */
  const at = (deg: number, r: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
  };
  /** Part of a circle from 12 o'clock clockwise, as a stroke-dasharray. */
  const arc = (r: number, part: number) => `${(2 * Math.PI * r * Math.min(1, Math.max(0, part))).toFixed(2)} ${(2 * Math.PI * r).toFixed(2)}`;
  const rot = (deg: number) => `rotate(${deg} ${C} ${C})`;

  /** The trailing sweep of the radar, as fading wedges behind the second hand. */
  const SWEEP = range(14).map((i) => {
    const a = at(-i * 5, 92);
    const b = at(-(i + 1) * 5, 92);
    return { d: `M${C} ${C} L${a.x.toFixed(2)} ${a.y.toFixed(2)} A92 92 0 0 0 ${b.x.toFixed(2)} ${b.y.toFixed(2)} Z`, o: 0.34 * (1 - i / 14) };
  });
</script>

<svg class="dial f-{face}" viewBox="0 0 200 200" width={size} height={size} role="img" aria-label="Clock {label}">
  {#if face === 'numerals'}
    <circle class="plate" cx={C} cy={C} r="96" />
    {#each MINUTES as i}
      <line class={i % 5 === 0 ? 'tick strong' : 'tick'} x1={C} y1="8" x2={C} y2={i % 5 === 0 ? 16 : 12} transform={rot(i * 6)} />
    {/each}
    {#each HOURS as i}
      {@const p = at(i * 30, 72)}
      <text dominant-baseline="central" class="num" x={p.x} y={p.y}>{i || 12}</text>
    {/each}
    <path class="hand" d="M97 110 L98.4 48 L100 44 L101.6 48 L103 110 Z" transform={rot(hDeg)} />
    <path class="hand" d="M97.8 112 L99 24 L100 20 L101 24 L102.2 112 Z" transform={rot(mDeg)} />
    <line class="second" x1={C} y1="118" x2={C} y2="18" transform={rot(sDeg)} />
    <circle class="hub" cx={C} cy={C} r="3" />
  {:else if face === 'roman'}
    <circle class="plate" cx={C} cy={C} r="96" />
    <circle class="ring" cx={C} cy={C} r="90" />
    <circle class="ring" cx={C} cy={C} r="83" />
    {#each MINUTES as i}
      <line class={i % 5 === 0 ? 'tick strong' : 'tick'} x1={C} y1="10" x2={C} y2="17" transform={rot(i * 6)} />
    {/each}
    {#each HOURS as i}
      {@const p = at(i * 30, 68)}
      <text dominant-baseline="central" class="num serif" x={p.x} y={p.y}>{ROMAN[i]}</text>
    {/each}
    <path class="hand" d="M100 112 C97 100 94.5 78 100 50 C105.5 78 103 100 100 112 Z" transform={rot(hDeg)} />
    <path class="hand" d="M100 114 C97.6 100 96 60 100 24 C104 60 102.4 100 100 114 Z" transform={rot(mDeg)} />
    <line class="second" x1={C} y1="120" x2={C} y2="20" transform={rot(sDeg)} />
    <circle class="hub" cx={C} cy={C} r="2.6" />
  {:else if face === 'station'}
    <circle class="plate solid" cx={C} cy={C} r="96" />
    {#each MINUTES as i}
      {#if i % 5 === 0}
        <rect class="block" x="97.2" y="9" width="5.6" height="20" transform={rot(i * 6)} />
      {:else}
        <rect class="block thin" x="99.2" y="9" width="1.6" height="7" transform={rot(i * 6)} />
      {/if}
    {/each}
    <rect class="block" x="95.6" y="42" width="8.8" height="74" transform={rot(hDeg)} />
    <rect class="block" x="96.8" y="14" width="6.4" height="104" transform={rot(mDeg)} />
    <g class="accent" transform={rot(sDeg)}>
      <rect x="99" y="30" width="2" height="96" />
      <circle cx={C} cy="126" r="5" />
    </g>
    <circle class="hub" cx={C} cy={C} r="3.4" />
  {:else if face === 'pilot'}
    <circle class="plate solid" cx={C} cy={C} r="96" />
    {#each MINUTES as i}
      <line class={i % 5 === 0 ? 'tick strong' : 'tick'} x1={C} y1="7" x2={C} y2={i % 5 === 0 ? 17 : 12} transform={rot(i * 6)} />
    {/each}
    <path class="lume" d="M100 22 L92 36 L108 36 Z" />
    <circle class="lume" cx="87" cy="25" r="1.8" />
    <circle class="lume" cx="113" cy="25" r="1.8" />
    {#each HOURS as i}
      {#if i}
        {@const p = at(i * 30, 68)}
        <text dominant-baseline="central" class="num bold" x={p.x} y={p.y}>{i}</text>
      {/if}
    {/each}
    <path class="hand outlined" d="M100 112 L95 100 L96 62 L100 50 L104 62 L105 100 Z" transform={rot(hDeg)} />
    <path class="hand outlined" d="M100 114 L96.4 102 L97.4 32 L100 20 L102.6 32 L103.6 102 Z" transform={rot(mDeg)} />
    <line class="second" x1={C} y1="122" x2={C} y2="16" transform={rot(sDeg)} />
    <circle class="hub" cx={C} cy={C} r="3" />
  {:else if face === 'diver'}
    <circle class="bezel" cx={C} cy={C} r="89" />
    {#each MINUTES as i}
      {#if i % 5 !== 0}
        {#if i < 15}<line class="tick" x1={C} y1="6" x2={C} y2="11" transform={rot(i * 6)} />{/if}
      {:else if i % 10 === 0 && i}
        {@const p = at(i * 6, 89)}
        <text dominant-baseline="central" class="num small" x={p.x} y={p.y}>{i}</text>
      {:else if i}
        <line class="tick strong" x1={C} y1="5" x2={C} y2="17" transform={rot(i * 6)} />
      {/if}
    {/each}
    <path class="accent" d="M100 17 L93.5 5.5 L106.5 5.5 Z" />
    <circle class="plate solid" cx={C} cy={C} r="78" />
    {#each HOURS as i}
      {#if i === 0}
        <path class="lume" d="M100 44 L92 30 L108 30 Z" />
      {:else if i % 3 === 0}
        <rect class="lume" x="96.5" y="28" width="7" height="17" rx="1" transform={rot(i * 30)} />
      {:else}
        {@const p = at(i * 30, 64)}
        <circle class="lume" cx={p.x} cy={p.y} r="5.2" />
      {/if}
    {/each}
    <path class="hand outlined" d="M96.5 110 L96.5 70 L93 66 L100 50 L107 66 L103.5 70 L103.5 110 Z" transform={rot(hDeg)} />
    <path class="hand outlined" d="M97 112 L97 40 L100 28 L103 40 L103 112 Z" transform={rot(mDeg)} />
    <g class="accent" transform={rot(sDeg)}>
      <rect x="99.4" y="30" width="1.2" height="92" />
      <circle cx={C} cy="46" r="3.4" />
    </g>
    <circle class="hub" cx={C} cy={C} r="3" />
  {:else if face === 'chrono'}
    <circle class="plate" cx={C} cy={C} r="96" />
    {#each range(120) as i}
      <line class={i % 10 === 0 ? 'tick strong' : 'tick'} x1={C} y1="6" x2={C} y2={i % 10 === 0 ? 15 : i % 2 === 0 ? 11 : 9} transform={rot(i * 3)} />
    {/each}
    {#each HOURS as i}
      {#if i % 3 !== 0 || i === 0}
        <rect class="block" x="98.4" y="19" width="3.2" height="12" transform={rot(i * 30)} />
      {/if}
    {/each}
    <!-- 9: weekday, 3: 24 hours, 6: date -->
    <g transform="translate(58 100)">
      <circle class="sub" r="21" />
      {#each WEEK as w, i}
        {@const a = ((i * 360) / 7 - 90) * (Math.PI / 180)}
        <text dominant-baseline="central" class="num tiny" class:today={i === weekday} x={15 * Math.cos(a)} y={15 * Math.sin(a)}>{w}</text>
      {/each}
      <line class="subhand" y1="3" y2="-10" transform="rotate({(weekday * 360) / 7})" />
    </g>
    <g transform="translate(142 100)">
      <circle class="sub" r="21" />
      {#each range(24) as i}
        <line class={i % 6 === 0 ? 'tick strong' : 'tick'} y1="-21" y2={i % 6 === 0 ? -16 : -18.5} transform="rotate({i * 15})" />
      {/each}
      <text dominant-baseline="central" class="num tiny" y="-11">24</text>
      <text dominant-baseline="central" class="num tiny" y="11.5">12</text>
      <line class="subhand" y1="3" y2="-15" transform="rotate({hours24 * 15})" />
    </g>
    <g transform="translate(100 142)">
      <circle class="sub" r="21" />
      {#each range(31) as i}
        <line class={i % 5 === 0 ? 'tick strong' : 'tick'} y1="-21" y2={i % 5 === 0 ? -16.5 : -18.5} transform="rotate({(i * 360) / 31})" />
      {/each}
      <text dominant-baseline="central" class="num tiny today" y="9.5">{dayOfMonth}</text>
      <line class="subhand" y1="3" y2="-15" transform="rotate({((dayOfMonth - 1) * 360) / 31})" />
    </g>
    <path class="hand" d="M97.4 108 L98.2 54 L100 50 L101.8 54 L102.6 108 Z" transform={rot(hDeg)} />
    <path class="hand" d="M98 110 L98.8 26 L100 22 L101.2 26 L102 110 Z" transform={rot(mDeg)} />
    <line class="second" x1={C} y1="124" x2={C} y2="10" transform={rot(sDeg)} />
    <circle class="hub" cx={C} cy={C} r="3" />
  {:else if face === 'bauhaus'}
    <circle class="plate" cx={C} cy={C} r="96" />
    {#each MINUTES as i}
      <line class={i % 5 === 0 ? 'tick fine long' : 'tick fine'} x1={C} y1="10" x2={C} y2={i % 5 === 0 ? 26 : 14} transform={rot(i * 6)} />
    {/each}
    <rect class="window" x="140" y="92.5" width="19" height="15" rx="1.5" />
    <text dominant-baseline="central" class="num small" x="149.5" y="100.4">{dayOfMonth}</text>
    <g transform="translate(100 142)">
      <circle class="sub" r="17" />
      {#each HOURS as i}
        <line class="tick fine" y1="-17" y2="-14" transform="rotate({i * 30})" />
      {/each}
      <line class="second" y1="4" y2="-14" transform="rotate({sDeg})" />
      <circle class="hub" r="1.4" />
    </g>
    <line class="stick" x1={C} y1="110" x2={C} y2="50" transform={rot(hDeg)} />
    <line class="stick thin" x1={C} y1="112" x2={C} y2="18" transform={rot(mDeg)} />
    <circle class="hub quiet" cx={C} cy={C} r="2.4" />
  {:else if face === 'day'}
    {@const sun = at(hours24 * 15, 58)}
    <circle class="plate" cx={C} cy={C} r="96" />
    <!-- midnight at the top, noon at the bottom: the top half is the night -->
    <path class="night" d="M4 100 A96 96 0 0 1 196 100 Z" />
    <line class="ring" x1="4" y1="100" x2="196" y2="100" />
    {#each range(24) as i}
      <line class={i % 2 === 0 ? 'tick strong' : 'tick'} x1={C} y1="7" x2={C} y2={i % 2 === 0 ? 15 : 11} transform={rot(i * 15)} />
      {#if i % 2 === 0}
        {@const p = at(i * 15, 77)}
        <text dominant-baseline="central" class="num small" x={p.x} y={p.y}>{i}</text>
      {/if}
    {/each}
    <line class="stick thin" x1={C} y1={C} x2={sun.x} y2={sun.y} />
    {#if hours24 >= 6 && hours24 < 18}
      <circle class="accent" cx={sun.x} cy={sun.y} r="8" />
      {#each range(8) as i}
        <line class="ray" x1={sun.x} y1={sun.y - 11} x2={sun.x} y2={sun.y - 14} transform="rotate({i * 45} {sun.x} {sun.y})" />
      {/each}
    {:else}
      <path class="accent" d="M{sun.x + 3} {sun.y - 8} a8 8 0 1 0 5 13 a7 7 0 0 1 -5 -13 Z" />
    {/if}
    <line class="second" x1={C} y1={C} x2={C} y2="24" transform={rot(mDeg)} />
    <circle class="hub" cx={C} cy={C} r="2.6" />
  {:else if face === 'arcs'}
    {#each [{ r: 86, part: seconds / 60, c: 'a-s' }, { r: 68, part: minutes / 60, c: 'a-m' }, { r: 50, part: hours / 12, c: 'a-h' }] as ring}
      <circle class="track" cx={C} cy={C} r={ring.r} />
      <circle class="arc {ring.c}" cx={C} cy={C} r={ring.r} stroke-dasharray={arc(ring.r, ring.part)} transform={rot(-90)} />
    {/each}
    <text dominant-baseline="central" class="num centre" x={C} y="98">{d.getHours() % 12 || 12}:{String(d.getMinutes()).padStart(2, '0')}</text>
    <text dominant-baseline="central" class="num tiny" x={C} y="116">{d.getHours() < 12 ? 'AM' : 'PM'}</text>
  {:else if face === 'orbit'}
    {@const ph = at(hDeg, 38)}
    {@const pm = at(mDeg, 62)}
    {@const ps = at(sDeg, 86)}
    <circle class="ring" cx={C} cy={C} r="38" />
    <circle class="ring" cx={C} cy={C} r="62" />
    <circle class="ring" cx={C} cy={C} r="86" />
    {#each HOURS as i}
      <line class={i % 3 === 0 ? 'tick strong' : 'tick'} x1={C} y1="3" x2={C} y2={i % 3 === 0 ? 9 : 7} transform={rot(i * 30)} />
    {/each}
    <circle class="sun" cx={C} cy={C} r="9" />
    <circle class="planet" cx={ph.x} cy={ph.y} r="8" />
    <circle class="planet small" cx={pm.x} cy={pm.y} r="5.5" />
    <circle class="accent" cx={ps.x} cy={ps.y} r="3.2" />
  {:else if face === 'radar'}
    {@const bh = at(hDeg, 46)}
    {@const bm = at(mDeg, 76)}
    <circle class="plate solid" cx={C} cy={C} r="96" />
    <circle class="ring" cx={C} cy={C} r="92" />
    <circle class="ring" cx={C} cy={C} r="62" />
    <circle class="ring" cx={C} cy={C} r="31" />
    <line class="ring" x1="8" y1={C} x2="192" y2={C} />
    <line class="ring" x1={C} y1="8" x2={C} y2="192" />
    {#each HOURS as i}
      <line class="tick strong" x1={C} y1="4" x2={C} y2="9" transform={rot(i * 30)} />
    {/each}
    <g transform={rot(sDeg)}>
      {#each SWEEP as w}<path class="sweep" d={w.d} opacity={w.o} />{/each}
      <line class="second" x1={C} y1={C} x2={C} y2="8" />
    </g>
    <circle class="blip" cx={bh.x} cy={bh.y} r="6" />
    <circle class="blip" cx={bm.x} cy={bm.y} r="3.6" />
    <text dominant-baseline="central" class="num tiny" x={bh.x} y={bh.y + 13}>H</text>
    <text dominant-baseline="central" class="num tiny" x={bm.x} y={bm.y + 11}>M</text>
    <circle class="hub" cx={C} cy={C} r="2" />
  {:else}
    <circle class="plate" cx={C} cy={C} r="96" />
    {#each HOURS as i}
      <line class={i % 3 === 0 ? 'mark mark-q' : 'mark'} x1={C} y1="12" x2={C} y2={i % 3 === 0 ? 24 : 19} transform={rot(i * 30)} />
    {/each}
    <line class="stick" x1={C} y1="108" x2={C} y2="56" transform={rot(hDeg)} />
    <line class="stick thin" x1={C} y1="110" x2={C} y2="30" transform={rot(mDeg)} />
    <line class="second" x1={C} y1="116" x2={C} y2="22" transform={rot(sDeg)} />
    <circle class="hub" cx={C} cy={C} r="2.6" />
  {/if}
</svg>

<style>
  .dial {
    display: block;
    flex-shrink: 0;
    overflow: visible;
  }
  .plate {
    fill: none;
    stroke: color-mix(in srgb, var(--bg2) 85%, transparent);
    stroke-width: 1;
  }
  .plate.solid {
    fill: color-mix(in srgb, var(--bg2) 28%, var(--bg1));
    stroke: var(--bg2);
    stroke-width: 1.5;
  }
  .ring,
  .sub {
    fill: none;
    stroke: color-mix(in srgb, var(--t1) 40%, transparent);
    stroke-width: 0.7;
  }
  .sub {
    fill: color-mix(in srgb, var(--bg2) 22%, var(--bg1));
  }
  .mark,
  .tick {
    stroke: color-mix(in srgb, var(--t1) 55%, transparent);
    stroke-width: 1;
    stroke-linecap: round;
  }
  .mark {
    stroke-width: 1.4;
  }
  .mark-q,
  .tick.strong {
    stroke: var(--t1);
    stroke-width: 1.8;
  }
  .tick.fine {
    stroke-width: 0.6;
    stroke-linecap: butt;
  }
  .tick.fine.long {
    stroke: var(--t2);
    stroke-width: 0.9;
  }
  .sub ~ .tick,
  g .tick {
    stroke-width: 0.7;
  }
  .num {
    fill: var(--t2);
    font-size: 14px;
    font-weight: 500;
    text-anchor: middle;
    font-variant-numeric: tabular-nums;
  }
  .num.serif {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 13px;
    font-weight: 400;
  }
  .num.bold {
    font-size: 17px;
    font-weight: 700;
  }
  .num.small {
    font-size: 9px;
    font-weight: 600;
    fill: var(--t1);
  }
  .num.tiny {
    font-size: 6.5px;
    font-weight: 600;
    fill: var(--t1);
  }
  .num.today {
    fill: var(--hl1);
  }
  .num.centre {
    font-size: 26px;
    font-weight: 300;
  }
  .hand,
  .block {
    fill: var(--t2);
  }
  .block.thin {
    fill: var(--t1);
  }
  .hand.outlined {
    fill: var(--t2);
    stroke: var(--bg1);
    stroke-width: 1;
    stroke-linejoin: round;
  }
  .lume {
    fill: var(--t2);
  }
  .stick {
    stroke: var(--t2);
    stroke-width: 3.2;
    stroke-linecap: round;
  }
  .stick.thin {
    stroke-width: 2;
  }
  .f-bauhaus .stick {
    stroke-width: 2.2;
    stroke-linecap: butt;
  }
  .f-bauhaus .stick.thin {
    stroke-width: 1.3;
  }
  .f-day .stick.thin {
    stroke: var(--t1);
    stroke-width: 1;
  }
  .second,
  .subhand {
    stroke: var(--hl1);
    stroke-width: 0.9;
    stroke-linecap: round;
  }
  .subhand {
    stroke-width: 1.2;
  }
  .f-day .second {
    stroke-width: 1.6;
  }
  .accent,
  .hub {
    fill: var(--hl1);
  }
  .hub.quiet {
    fill: var(--t2);
  }
  .ray {
    stroke: var(--hl1);
    stroke-width: 1.3;
    stroke-linecap: round;
  }
  .bezel {
    fill: none;
    stroke: color-mix(in srgb, var(--bg2) 75%, var(--bg1));
    stroke-width: 15;
  }
  .window {
    fill: color-mix(in srgb, var(--bg2) 30%, var(--bg1));
    stroke: color-mix(in srgb, var(--t1) 50%, transparent);
    stroke-width: 0.7;
  }
  .night {
    fill: color-mix(in srgb, var(--bg2) 45%, var(--bg1));
  }
  .track,
  .arc {
    fill: none;
    stroke-width: 11;
  }
  .track {
    stroke: color-mix(in srgb, var(--bg2) 45%, var(--bg1));
  }
  .arc {
    stroke-linecap: round;
  }
  .a-s {
    stroke: var(--hl1);
  }
  .a-m {
    stroke: var(--t2);
  }
  .a-h {
    stroke: var(--t1);
  }
  .sun {
    fill: color-mix(in srgb, var(--hl1) 28%, var(--bg1));
    stroke: var(--hl1);
    stroke-width: 1;
  }
  .planet {
    fill: var(--t2);
  }
  .planet.small {
    fill: var(--t1);
  }
  .sweep {
    fill: var(--hl1);
  }
  .blip {
    fill: var(--hl1);
    filter: drop-shadow(0 0 4px var(--hl1));
  }
</style>
