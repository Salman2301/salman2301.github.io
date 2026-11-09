<script lang="ts">
  import type { Reminder } from '../../core/reminders';
  import { toDate, weekDays, type Level } from './cal';

  export let cur: string;
  export let today: string;
  export let byDay: Record<string, Reminder[]>;
  export let zoom: (level: Level, key: string, el: HTMLElement) => void;
  export let openItem: (r: Reminder) => void;

  $: days = weekDays(cur);
</script>

<div class="week">
  {#each days as key (key)}
    {@const d = toDate(key)}
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="col" class:today={key === today} data-date={key} on:click={(e) => zoom('day', key, e.currentTarget)}>
      <button class="head" on:click|stopPropagation={(e) => zoom('day', key, e.currentTarget)}>
        <span class="wd">{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
        <span class="num">{d.getDate()}</span>
      </button>
      <div class="items">
        {#each byDay[key] ?? [] as r (r.kind + r.id + (r.time ?? ''))}
          <button class="item" class:done={r.done} class:note={r.kind === 'note'} title={r.label} on:click|stopPropagation={() => openItem(r)}>
            <span class="t">{r.time ?? (r.kind === 'note' ? 'note' : 'all day')}</span>
            <span class="l">{r.label}</span>
          </button>
        {:else}
          <span class="empty">·</span>
        {/each}
      </div>
    </div>
  {/each}
</div>

<style>
  .week {
    height: 100%;
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 6px;
    padding: 4px 8px 8px;
  }
  .col {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px;
    border: 1px solid color-mix(in srgb, var(--bg2) 80%, transparent);
    border-radius: 8px;
    overflow: hidden;
    cursor: zoom-in;
  }
  .col:hover {
    background: color-mix(in srgb, var(--bg2) 18%, transparent);
  }
  .col.today {
    border-color: var(--hl1);
  }
  .head {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    color: var(--t2);
  }
  .head .wd {
    color: var(--t1);
    font-size: 11px;
    text-transform: uppercase;
  }
  .head .num {
    font-size: 20px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .col.today .num {
    color: var(--hl1);
  }
  .items {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .item {
    display: flex;
    flex-direction: column;
    padding: 3px 6px;
    border-radius: 5px;
    border-left: 2px solid var(--hl1);
    background: color-mix(in srgb, var(--hl1) 12%, transparent);
    color: var(--t2);
    font-size: 11px;
    text-align: left;
  }
  .item.note {
    border-left-color: var(--t1);
    background: color-mix(in srgb, var(--bg2) 40%, transparent);
  }
  .item.done .l {
    color: var(--t1);
    text-decoration: line-through;
  }
  .item:hover .l {
    color: var(--hl1);
  }
  .t {
    color: var(--t1);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }
  .l {
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
  }
  .empty {
    color: var(--t1);
    opacity: 0.4;
  }
</style>
