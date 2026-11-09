<script lang="ts">
  import type { Reminder } from '../../core/reminders';
  import { monthGrid, WEEKDAYS_SHORT, type Level } from './cal';

  export let cur: string;
  export let today: string;
  export let byDay: Record<string, Reminder[]>;
  export let zoom: (level: Level, key: string, el: HTMLElement) => void;
  export let openItem: (r: Reminder) => void;

  const MAX = 3;
  $: grid = monthGrid(Number(cur.slice(0, 4)), Number(cur.slice(5, 7)) - 1);
</script>

<div class="month">
  {#each WEEKDAYS_SHORT as w}<span class="wd">{w}</span>{/each}
  {#each grid as d (d.key)}
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="cell" class:out={!d.inMonth} class:today={d.key === today} data-date={d.key} on:click={(e) => zoom('day', d.key, e.currentTarget)}>
      <button class="num" on:click|stopPropagation={(e) => zoom('day', d.key, e.currentTarget)} aria-label="Open {d.key}">{d.day}</button>
      {#each (byDay[d.key] ?? []).slice(0, MAX) as r (r.kind + r.id + (r.time ?? ''))}
        <button class="item" class:done={r.done} class:note={r.kind === 'note'} title={r.label} on:click|stopPropagation={() => openItem(r)}>
          {#if r.time}<span class="t">{r.time}</span>{/if}{r.label}
        </button>
      {/each}
      {#if (byDay[d.key]?.length ?? 0) > MAX}
        <span class="more">+{byDay[d.key].length - MAX} more</span>
      {/if}
    </div>
  {/each}
</div>

<style>
  .month {
    height: 100%;
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    grid-template-rows: auto repeat(6, minmax(64px, 1fr));
    gap: 1px;
    padding: 0 8px 8px;
  }
  .wd {
    padding: 4px 6px;
    color: var(--t1);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .cell {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 3px 4px;
    border-top: 1px solid color-mix(in srgb, var(--bg2) 80%, transparent);
    overflow: hidden;
    cursor: zoom-in;
  }
  .cell:hover {
    background: color-mix(in srgb, var(--bg2) 22%, transparent);
  }
  .cell.out {
    opacity: 0.4;
  }
  .num {
    align-self: flex-start;
    min-width: 22px;
    height: 20px;
    padding: 0 5px;
    border-radius: 10px;
    color: var(--t2);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .num:hover {
    color: var(--hl1);
  }
  .cell.today .num {
    background: var(--hl1);
    color: var(--bg1);
    font-weight: 700;
  }
  .item {
    display: block;
    width: 100%;
    padding: 1px 5px;
    border-radius: 4px;
    border-left: 2px solid var(--hl1);
    background: color-mix(in srgb, var(--hl1) 12%, transparent);
    color: var(--t2);
    font-size: 11px;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .item.note {
    border-left-color: var(--t1);
    background: color-mix(in srgb, var(--bg2) 40%, transparent);
  }
  .item.done {
    color: var(--t1);
    text-decoration: line-through;
  }
  .item:hover {
    color: var(--hl1);
  }
  .t {
    margin-right: 4px;
    color: var(--t1);
    font-variant-numeric: tabular-nums;
  }
  .more {
    padding-left: 5px;
    color: var(--t1);
    font-size: 10px;
  }
</style>
