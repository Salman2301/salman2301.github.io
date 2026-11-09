<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { Reminder } from '../../core/reminders';
  import { addTask, INBOX_ID, setDue } from '../../core/tasks';
  import { formatDate } from '../../core/dates';

  export let cur: string;
  export let today: string;
  export let byDay: Record<string, Reminder[]>;
  export let openItem: (r: Reminder) => void;
  /** Where new reminders go: a project id, or 'all' for the Inbox. */
  export let list = 'all';

  const HOURS = Array.from({ length: 24 }, (_, h) => h);
  const ROW = 44;
  const pad = (n: number) => String(n).padStart(2, '0');

  $: items = byDay[cur] ?? [];
  $: allDay = items.filter((r) => !r.time);
  $: byHour = items.reduce<Record<number, Reminder[]>>((m, r) => {
    if (r.time) (m[Number(r.time.slice(0, 2))] ??= []).push(r);
    return m;
  }, {});

  let now = new Date();
  const tick = setInterval(() => (now = new Date()), 60_000);
  onDestroy(() => clearInterval(tick));
  $: nowTop = (now.getHours() + now.getMinutes() / 60) * ROW;

  let scroller: HTMLDivElement;
  onMount(() => {
    // Start around now on today, else at 8:00.
    const h = cur === today ? Math.max(0, now.getHours() - 2) : 8;
    scroller?.scrollTo({ top: h * ROW });
  });

  /* ---------------------------------------------------------- quick add */

  let input: HTMLInputElement;
  let text = '';
  /** "HH:MM" picked by clicking an hour, or '' for all day. */
  let time = '';

  function pickHour(h: number) {
    time = `${pad(h)}:00`;
    input?.focus();
  }

  function add() {
    const t = addTask(text, { projectId: list === 'all' ? INBOX_ID : list });
    if (!t) return;
    // A date typed into the text (@tmrw) wins; otherwise this day, at the picked hour.
    if (!t.due) setDue(t.id, time ? `${cur} ${time}` : cur);
    text = '';
  }
</script>

<div class="day">
  <form class="add" on:submit|preventDefault={add}>
    <input
      bind:this={input}
      bind:value={text}
      placeholder="add a reminder for {formatDate(cur)}{time ? ` at ${time}` : ''}"
      aria-label="New reminder"
      maxlength="200"
      spellcheck="false"
    />
    {#if time}<button type="button" class="clear" on:click={() => (time = '')} title="Make it all day">{time} ×</button>{/if}
  </form>

  {#if allDay.length}
    <div class="allday">
      <span class="lab">all day</span>
      {#each allDay as r (r.kind + r.id)}
        <button class="item" class:done={r.done} class:note={r.kind === 'note'} on:click={() => openItem(r)}>{r.label}</button>
      {/each}
    </div>
  {/if}

  <div class="hours" bind:this={scroller}>
    <div class="track" style="height:{24 * ROW}px">
      {#each HOURS as h}
        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <div class="hour" style="top:{h * ROW}px;height:{ROW}px" class:picked={time === `${pad(h)}:00`} on:click={() => pickHour(h)} title="Add a reminder at {pad(h)}:00">
          <span class="hl">{pad(h)}:00</span>
          <div class="slot">
            {#each byHour[h] ?? [] as r (r.kind + r.id + r.time)}
              <button class="item" class:done={r.done} class:note={r.kind === 'note'} on:click|stopPropagation={() => openItem(r)}>
                <span class="t">{r.time}</span>{r.label}
              </button>
            {/each}
          </div>
        </div>
      {/each}
      {#if cur === today}
        <div class="now" style="top:{nowTop}px"><span /></div>
      {/if}
    </div>
  </div>
</div>

<style>
  .day {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 0 10px 8px;
    gap: 8px;
  }
  .add {
    display: flex;
    gap: 6px;
  }
  .add input {
    flex: 1;
    min-width: 0;
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid var(--bg2);
    background: transparent;
    color: var(--t2);
    font: inherit;
    outline: none;
  }
  .add input:focus {
    border-color: var(--hl1);
  }
  .clear {
    padding: 0 8px;
    border-radius: 6px;
    border: 1px solid var(--hl1);
    color: var(--hl1);
    font-size: 11px;
  }
  .allday {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
  }
  .lab {
    color: var(--t1);
    font-size: 11px;
    margin-right: 4px;
  }
  .hours {
    flex: 1;
    min-height: 0;
    overflow: auto;
    border-top: 1px solid color-mix(in srgb, var(--bg2) 80%, transparent);
  }
  .track {
    position: relative;
  }
  .hour {
    position: absolute;
    left: 0;
    right: 0;
    display: flex;
    gap: 10px;
    border-bottom: 1px dashed color-mix(in srgb, var(--bg2) 70%, transparent);
    cursor: copy;
  }
  .hour:hover,
  .hour.picked {
    background: color-mix(in srgb, var(--hl1) 6%, transparent);
  }
  .hl {
    flex: 0 0 44px;
    padding-top: 2px;
    color: var(--t1);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .slot {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 4px;
    padding: 3px 0;
    overflow: hidden;
  }
  .item {
    max-width: 100%;
    padding: 2px 8px;
    border-radius: 5px;
    border-left: 2px solid var(--hl1);
    background: color-mix(in srgb, var(--hl1) 14%, transparent);
    color: var(--t2);
    font-size: 12px;
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
    margin-right: 6px;
    color: var(--t1);
    font-variant-numeric: tabular-nums;
  }
  .now {
    position: absolute;
    left: 40px;
    right: 0;
    height: 0;
    border-top: 2px solid var(--hl1);
    pointer-events: none;
  }
  .now span {
    position: absolute;
    left: -5px;
    top: -6px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--hl1);
  }
</style>
