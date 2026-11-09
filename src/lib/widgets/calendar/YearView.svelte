<script lang="ts">
  import type { Reminder } from '../../core/reminders';
  import { monthGrid, WEEKDAYS_SHORT, type Level } from './cal';

  export let cur: string;
  export let today: string;
  export let byDay: Record<string, Reminder[]>;
  export let zoom: (level: Level, key: string, el: HTMLElement) => void;

  $: year = Number(cur.slice(0, 4));
  $: curMonth = Number(cur.slice(5, 7)) - 1;
  const MONTHS = Array.from({ length: 12 }, (_, m) => m);
  const name = (m: number) => new Date(2000, m, 1).toLocaleDateString(undefined, { month: 'long' });
  const pad = (n: number) => String(n).padStart(2, '0');
</script>

<div class="year">
  {#each MONTHS as m}
    <section class="mon" class:current={m === curMonth} data-date="{year}-{pad(m + 1)}-01">
      <button class="mname" on:click={(e) => zoom('month', `${year}-${pad(m + 1)}-01`, e.currentTarget)}>{name(m)}</button>
      <div class="grid">
        {#each WEEKDAYS_SHORT as w}<span class="wd">{w[0]}</span>{/each}
        {#each monthGrid(year, m) as d (d.key)}
          {#if d.inMonth}
            <button
              class="d"
              data-date={d.key}
              class:today={d.key === today}
              class:has={!!byDay[d.key]}
              aria-label="{d.key}{byDay[d.key] ? `, ${byDay[d.key].length} reminders` : ''}"
              on:click={(e) => zoom('day', d.key, e.currentTarget)}>{d.day}</button
            >
          {:else}
            <span class="d out" />
          {/if}
        {/each}
      </div>
    </section>
  {/each}
</div>

<style>
  .year {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
    gap: 14px 18px;
    padding: 12px 14px 16px;
  }
  .mon {
    padding: 6px;
    border-radius: 8px;
  }
  .mon.current {
    background: color-mix(in srgb, var(--bg2) 22%, transparent);
  }
  .mname {
    margin: 0 0 4px 2px;
    color: var(--t2);
    font-weight: 600;
    font-size: 12px;
  }
  .mname:hover,
  .mon.current .mname {
    color: var(--hl1);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 1px;
    text-align: center;
  }
  .wd {
    color: var(--t1);
    font-size: 9px;
    opacity: 0.8;
  }
  .d {
    position: relative;
    height: 20px;
    border-radius: 4px;
    color: var(--t2);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }
  button.d:hover {
    background: color-mix(in srgb, var(--bg2) 60%, transparent);
  }
  .d.has::after {
    content: '';
    position: absolute;
    bottom: 1px;
    left: 50%;
    width: 3px;
    height: 3px;
    margin-left: -1.5px;
    border-radius: 50%;
    background: var(--hl1);
  }
  .d.today {
    background: var(--hl1);
    color: var(--bg1);
    font-weight: 700;
  }
  .d.today.has::after {
    background: var(--bg1);
  }
</style>
