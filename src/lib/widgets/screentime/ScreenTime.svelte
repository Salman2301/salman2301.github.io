<script lang="ts">
  import { onDestroy } from 'svelte';
  import { getWidget } from '../../core/registry';
  import { formatDuration, lastDays, screenTime } from '../../core/screentime';
  import { spaceName } from '../../core/spaces';
  import { projects } from '../../core/tasks';
  import type { Config } from '../../core/types';

  export let paneId: string;
  export let focused = false;
  export let config: Config = {};
  export let updateConfig: (patch: Config) => void = () => {};
  $: void paneId, focused;

  /**
   * Screen time, one series at a time, so every chart uses the theme's accent
   * only: daily totals (today in full accent, other days softer), and today
   * split by widget, by space and by hour. Hover any bar for its value; the
   * table view lists the same numbers.
   */

  let now = new Date();
  const clock = setInterval(() => (now = new Date()), 60_000);
  onDestroy(() => clearInterval(clock));

  $: range = config.range === 30 ? 30 : 7;
  $: view = config.view === 'table' ? 'table' : 'charts';
  $: days = lastDays($screenTime, range, now);
  $: today = days[days.length - 1].day;
  $: earlier = days.slice(0, -1).filter((d) => d.day.total > 0);
  $: average = earlier.length ? earlier.reduce((a, d) => a + d.day.total, 0) / earlier.length : 0;
  $: maxDay = Math.max(60, ...days.map((d) => d.day.total), average);

  const top = (rec: Record<string, number>, n: number) =>
    Object.entries(rec)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);
  $: byWidget = top(today.widgets, 6).map(([id, s]) => ({ id, label: getWidget(id)?.title ?? id, s }));
  $: spaceTotals = days.reduce<Record<string, number>>((m, d) => {
    for (const [id, s] of Object.entries(d.day.spaces)) m[id] = (m[id] ?? 0) + s;
    return m;
  }, {});
  $: bySpace = top(spaceTotals, 6).map(([id, s]) => ({ id, label: id === 'all' ? 'all spaces' : spaceName($projects, id), s }));
  $: maxWidget = Math.max(1, ...byWidget.map((r) => r.s));
  $: maxSpace = Math.max(1, ...bySpace.map((r) => r.s));
  $: maxHour = Math.max(60, ...today.hours);

  const dayLabel = (key: string, long = false) =>
    new Date(`${key}T00:00`).toLocaleDateString(undefined, long ? { weekday: 'short', day: 'numeric', month: 'short' } : range === 7 ? { weekday: 'short' } : { day: 'numeric' });

  /* -------------------------------------------------------------- chart */

  // Daily bars in a 100 x 40 viewBox, scaled to the pane's width.
  const VW = 100;
  const VH = 40;
  const GAP = 0.8; // about 2px at common widths: a surface gap between bars
  $: slot = VW / days.length;
  $: barW = Math.max(0.6, slot - GAP);
  const barH = (s: number, max: number) => (s / max) * (VH - 2);
  /** A bar with a rounded top (4px-ish) and a square base on the baseline. */
  function barPath(x: number, w: number, h: number, base: number, r: number) {
    if (h <= 0) return '';
    const rr = Math.min(r, w / 2, h);
    const y = base - h;
    return `M${x},${base}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${base}Z`;
  }

  /* ------------------------------------------------------------- tooltip */

  let root: HTMLDivElement;
  let tip: { x: number; y: number; text: string } | null = null;
  function showTip(e: MouseEvent, text: string) {
    const r = (e.currentTarget as Element).getBoundingClientRect();
    const box = root.getBoundingClientRect();
    tip = { x: r.left + r.width / 2 - box.left, y: r.top - box.top, text };
  }
  const hideTip = () => (tip = null);

  let width = 0;
  $: wide = width >= 520;
</script>

<div class="st" class:wide bind:this={root} bind:clientWidth={width}>
  <div class="head">
    <div class="hero">
      <span class="label">today</span>
      <span class="big">{formatDuration(today.total)}</span>
      {#if average > 0}
        <span class="delta">
          {today.total >= average ? `${formatDuration(today.total - average)} more` : `${formatDuration(average - today.total)} less`} than your {range}-day average ({formatDuration(average)})
        </span>
      {:else}
        <span class="delta">counted while this page is open and you are using it</span>
      {/if}
    </div>
    <div class="controls">
      <div class="seg" role="group" aria-label="Range">
        <button aria-pressed={range === 7} on:click={() => updateConfig({ range: 7 })}>7 days</button>
        <button aria-pressed={range === 30} on:click={() => updateConfig({ range: 30 })}>30 days</button>
      </div>
      <button class="toggle" aria-pressed={view === 'table'} on:click={() => updateConfig({ view: view === 'table' ? 'charts' : 'table' })}>
        {view === 'table' ? 'charts' : 'table'}
      </button>
    </div>
  </div>

  {#if view === 'table'}
    <div class="table-wrap">
      <table>
        <caption>Screen time, last {range} days</caption>
        <thead><tr><th scope="col">day</th><th scope="col">time</th><th scope="col">most used</th></tr></thead>
        <tbody>
          {#each [...days].reverse() as d (d.key)}
            {@const best = top(d.day.widgets, 1)[0]}
            <tr>
              <th scope="row">{dayLabel(d.key, true)}</th>
              <td>{formatDuration(d.day.total)}</td>
              <td>{best ? `${getWidget(best[0])?.title ?? best[0]} · ${formatDuration(best[1])}` : '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <section class="daily" aria-label="Screen time per day">
      <svg viewBox="0 0 {VW} {VH}" preserveAspectRatio="none" role="img" aria-label="Daily screen time, last {range} days">
        {#each days as d, i (d.key)}
          {@const h = barH(d.day.total, maxDay)}
          <!-- A full-height invisible target, wider than the bar, carries the hover. Each bar is
               labelled for screen readers, and the table view lists the same numbers. -->
          <rect
            class="hit"
            x={i * slot}
            y="0"
            width={slot}
            height={VH}
            role="img"
            aria-label="{dayLabel(d.key, true)}: {formatDuration(d.day.total)}"
            on:mouseenter={(e) => showTip(e, `${dayLabel(d.key, true)} · ${formatDuration(d.day.total)}`)}
            on:mouseleave={hideTip}
          />
          <path class="bar" class:today={i === days.length - 1} d={barPath(i * slot + GAP / 2, barW, h, VH, 1.2)} />
        {/each}
        {#if average > 0}
          <line class="avg" x1="0" x2={VW} y1={VH - barH(average, maxDay)} y2={VH - barH(average, maxDay)} />
        {/if}
        <line class="base" x1="0" x2={VW} y1={VH - 0.15} y2={VH - 0.15} />
      </svg>
      <div class="xlabels" style="--n:{days.length}">
        {#each days as d, i (d.key)}
          <!-- every day for a week; every fifth day (counting back from today) for a month -->
          <span class:on={i === days.length - 1}>{range === 7 || (days.length - 1 - i) % 5 === 0 ? dayLabel(d.key) : ''}</span>
        {/each}
      </div>
      {#if average > 0}<p class="legend"><span class="dash" /> {range}-day average</p>{/if}
    </section>

    <div class="splits">
      <section aria-label="Today by widget">
        <h3>today by widget</h3>
        {#each byWidget as r (r.id)}
          <div class="hrow" role="img" aria-label="{r.label}: {formatDuration(r.s)}" on:mouseenter={(e) => showTip(e, `${r.label} · ${formatDuration(r.s)}`)} on:mouseleave={hideTip}>
            <span class="name">{r.label}</span>
            <span class="track"><span class="fill" style="width:{(r.s / maxWidget) * 100}%" /></span>
            <span class="val">{formatDuration(r.s)}</span>
          </div>
        {:else}
          <p class="none">nothing yet today</p>
        {/each}
      </section>

      {#if bySpace.length > 1}
        <section aria-label="By space">
          <h3>by space, last {range} days</h3>
          {#each bySpace as r (r.id)}
            <div class="hrow" role="img" aria-label="{r.label}: {formatDuration(r.s)}" on:mouseenter={(e) => showTip(e, `${r.label} · ${formatDuration(r.s)}`)} on:mouseleave={hideTip}>
              <span class="name">{r.label}</span>
              <span class="track"><span class="fill" style="width:{(r.s / maxSpace) * 100}%" /></span>
              <span class="val">{formatDuration(r.s)}</span>
            </div>
          {/each}
        </section>
      {/if}

      <section class="hours" aria-label="Today by hour">
        <h3>today by hour</h3>
        <div class="hourbars">
          {#each today.hours as s, h}
            <span
              class="hb"
              class:now={h === now.getHours()}
              role="img"
              aria-label="{String(h).padStart(2, '0')}:00: {formatDuration(s)}"
              on:mouseenter={(e) => showTip(e, `${String(h).padStart(2, '0')}:00 · ${formatDuration(s)}`)}
              on:mouseleave={hideTip}
            >
              <span class="hfill" style="height:{(s / maxHour) * 100}%" />
            </span>
          {/each}
        </div>
        <div class="hlabels"><span>0</span><span>6</span><span>12</span><span>18</span><span>23</span></div>
      </section>
    </div>
  {/if}

  {#if tip}
    <div class="tip" style="left:{tip.x}px;top:{tip.y}px" role="tooltip">{tip.text}</div>
  {/if}
</div>

<style>
  .st {
    position: relative;
    height: 100%;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 12px 14px;
    color: var(--t2);
    font-size: 12px;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 8px 16px;
  }
  .hero {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .label,
  h3 {
    margin: 0;
    color: var(--t1);
    font-size: 10.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .big {
    font-size: 30px;
    font-weight: 700;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }
  .delta {
    color: var(--t1);
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .seg {
    display: flex;
    border: 1px solid var(--bg2);
    border-radius: 999px;
    padding: 2px;
  }
  .seg button,
  .toggle {
    padding: 2px 9px;
    border-radius: 999px;
    color: var(--t1);
    font-size: 11px;
  }
  .seg button[aria-pressed='true'] {
    background: var(--hl1);
    color: var(--bg1);
  }
  .toggle {
    border: 1px solid var(--bg2);
  }
  .toggle:hover,
  .seg button:not([aria-pressed='true']):hover {
    color: var(--hl1);
  }

  /* daily bars: one series, the theme accent; today full, other days softer */
  .daily svg {
    display: block;
    width: 100%;
    height: 120px;
    overflow: visible;
  }
  .bar {
    fill: color-mix(in srgb, var(--hl1) 55%, var(--bg1));
    pointer-events: none;
  }
  .bar.today {
    fill: var(--hl1);
  }
  .hit {
    fill: transparent;
    outline: none;
  }
  .hit:hover + .bar,
  .hit:focus + .bar {
    fill: var(--hl1);
  }
  .avg {
    stroke: var(--t1);
    stroke-width: 1.2;
    stroke-dasharray: 3 3;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }
  .base {
    stroke: color-mix(in srgb, var(--bg2) 90%, transparent);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  .xlabels {
    display: grid;
    grid-template-columns: repeat(var(--n), 1fr);
    margin-top: 4px;
    color: var(--t1);
    font-size: 10px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .xlabels .on {
    color: var(--t2);
    font-weight: 600;
  }
  .legend {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 4px 0 0;
    color: var(--t1);
    font-size: 10.5px;
  }
  .dash {
    width: 16px;
    border-top: 1.5px dashed var(--t1);
  }

  /* breakdowns */
  .splits {
    display: grid;
    grid-template-columns: 1fr;
    gap: 14px;
  }
  .wide .splits {
    grid-template-columns: 1fr 1fr;
  }
  .wide .hours {
    grid-column: 1 / -1;
  }
  section h3 {
    margin-bottom: 6px;
  }
  .hrow {
    display: grid;
    grid-template-columns: minmax(70px, 34%) 1fr auto;
    align-items: center;
    gap: 8px;
    padding: 2px 0;
  }
  .hrow:hover .fill {
    background: var(--hl1);
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .track {
    height: 8px;
  }
  .fill {
    display: block;
    height: 100%;
    min-width: 2px;
    border-radius: 0 4px 4px 0;
    background: color-mix(in srgb, var(--hl1) 70%, var(--bg1));
  }
  .val {
    color: var(--t1);
    font-variant-numeric: tabular-nums;
  }
  .none {
    margin: 0;
    color: var(--t1);
  }
  .hourbars {
    display: grid;
    grid-template-columns: repeat(24, 1fr);
    gap: 2px;
    height: 44px;
    align-items: end;
    border-bottom: 1px solid color-mix(in srgb, var(--bg2) 90%, transparent);
  }
  .hb {
    height: 100%;
    display: flex;
    align-items: flex-end;
    outline: none;
  }
  .hfill {
    display: block;
    width: 100%;
    min-height: 1px;
    border-radius: 3px 3px 0 0;
    background: color-mix(in srgb, var(--hl1) 55%, var(--bg1));
  }
  .hb.now .hfill,
  .hb:hover .hfill,
  .hb:focus .hfill {
    background: var(--hl1);
  }
  .hlabels {
    display: flex;
    justify-content: space-between;
    margin-top: 3px;
    color: var(--t1);
    font-size: 10px;
  }

  /* table view */
  .table-wrap {
    overflow: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }
  caption {
    text-align: left;
    color: var(--t1);
    padding-bottom: 6px;
  }
  th,
  td {
    padding: 4px 6px;
    text-align: left;
    border-bottom: 1px solid color-mix(in srgb, var(--bg2) 70%, transparent);
  }
  thead th {
    color: var(--t1);
    font-weight: 600;
  }
  tbody th {
    font-weight: 400;
    color: var(--t2);
  }
  td {
    color: var(--t2);
  }

  .tip {
    position: absolute;
    z-index: 5;
    transform: translate(-50%, calc(-100% - 6px));
    padding: 3px 8px;
    border: 1px solid var(--bg2);
    border-radius: 6px;
    background: var(--bg1);
    color: var(--t2);
    font-size: 11px;
    white-space: nowrap;
    pointer-events: none;
    box-shadow: 0 6px 16px -8px color-mix(in srgb, var(--bg2) 80%, transparent);
  }
</style>
