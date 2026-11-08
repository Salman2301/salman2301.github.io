<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';

  /**
   * A small calendar popover with optional time fields. `value` is
   * "YYYY-MM-DD" or, with withTime, "YYYY-MM-DD HH:MM". Picking a day emits
   * `pick` straight away when there is no time; with a time it waits for the
   * "set" button. The parent positions this (it renders position:absolute).
   */
  export let value = '';
  export let withTime = false;

  const dispatch = createEventDispatcher<{ pick: string; close: void }>();
  const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

  const parsed = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(value);
  const today = new Date();
  let viewYear = parsed ? +parsed[1] : today.getFullYear();
  let viewMonth = parsed ? +parsed[2] - 1 : today.getMonth();
  let selected = parsed ? `${parsed[1]}-${parsed[2]}-${parsed[3]}` : '';
  let hh = parsed?.[4] ?? pad(today.getHours());
  let mm = parsed?.[5] ?? pad(Math.round(today.getMinutes() / 5) * 5 % 60);

  $: cells = (() => {
    const offset = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
    const days = new Date(viewYear, viewMonth + 1, 0).getDate();
    const out: (number | null)[] = Array(offset).fill(null);
    for (let d = 1; d <= days; d++) out.push(d);
    while (out.length % 7) out.push(null);
    return out;
  })();

  const isSelected = (d: number | null) => d !== null && selected === ymd(viewYear, viewMonth, d);
  const isToday = (d: number | null) =>
    d !== null && ymd(viewYear, viewMonth, d) === ymd(today.getFullYear(), today.getMonth(), today.getDate());

  function shift(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    viewYear = d.getFullYear();
    viewMonth = d.getMonth();
  }

  function timeValue() {
    return withTime ? `${pad(+hh || 0)}:${pad(+mm || 0)}` : '';
  }

  function emit(datePart: string) {
    dispatch('pick', withTime ? `${datePart} ${timeValue()}` : datePart);
  }

  function choose(d: number | null) {
    if (d === null) return;
    selected = ymd(viewYear, viewMonth, d);
    if (!withTime) emit(selected);
  }

  function pickToday() {
    const t = ymd(today.getFullYear(), today.getMonth(), today.getDate());
    viewYear = today.getFullYear();
    viewMonth = today.getMonth();
    selected = t;
    if (!withTime) emit(t);
  }

  function setNow() {
    hh = pad(today.getHours());
    mm = pad(today.getMinutes());
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      dispatch('close');
    }
  }

  // close on an outside click. Buttons marked data-picker-toggle open it themselves, so they are skipped.
  let root: HTMLDivElement;
  function onDown(e: PointerEvent) {
    const target = e.target as Element;
    if (root && !root.contains(target) && !target.closest?.('[data-picker-toggle]')) dispatch('close');
  }
  onMount(() => window.addEventListener('pointerdown', onDown, true));
  onDestroy(() => window.removeEventListener('pointerdown', onDown, true));
</script>

<div class="picker" bind:this={root} role="dialog" aria-label="Pick a date" on:keydown={onKey}>
  <div class="head">
    <button on:click={() => shift(-1)} aria-label="Previous month">‹</button>
    <span class="month">{new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
    <button on:click={() => shift(1)} aria-label="Next month">›</button>
  </div>
  <div class="grid">
    {#each WEEKDAYS as w}<span class="wd">{w}</span>{/each}
    {#each cells as d}
      <button class="day" class:blank={d === null} class:today={isToday(d)} class:on={isSelected(d)} disabled={d === null} on:click={() => choose(d)}>{d ?? ''}</button>
    {/each}
  </div>
  {#if withTime}
    <div class="time">
      <label>time <input type="number" min="0" max="23" bind:value={hh} aria-label="Hour" /> : <input type="number" min="0" max="59" step="5" bind:value={mm} aria-label="Minute" /></label>
      <button on:click={setNow}>now</button>
    </div>
  {/if}
  <div class="foot">
    <button on:click={pickToday}>today</button>
    <button on:click={() => { selected = ''; emit(''); }}>clear</button>
    {#if withTime}
      <button class="primary" disabled={!selected} on:click={() => emit(selected)}>set</button>
    {/if}
  </div>
</div>

<style>
  .picker {
    width: 232px;
    padding: 10px;
    border-radius: 10px;
    border: 1px solid var(--bg2);
    background: var(--bg1);
    box-shadow: 0 16px 40px -12px rgba(0, 0, 0, 0.6);
    color: var(--t2);
    font-size: 12px;
    z-index: 70;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .head button {
    width: 26px;
    height: 24px;
    border-radius: 6px;
    color: var(--t1);
    font-size: 15px;
  }
  .head button:hover {
    color: var(--hl1);
  }
  .month {
    font-size: 12px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
  }
  .wd {
    text-align: center;
    font-size: 10px;
    color: var(--t1);
    text-transform: uppercase;
    padding: 2px 0;
  }
  .day {
    height: 26px;
    border-radius: 6px;
    font-variant-numeric: tabular-nums;
    color: var(--t2);
  }
  .day:hover:not(:disabled) {
    background: color-mix(in srgb, var(--bg2) 70%, transparent);
  }
  .day.blank {
    visibility: hidden;
  }
  .day.today {
    outline: 1px solid var(--hl1);
  }
  .day.on {
    background: var(--hl1);
    color: var(--bg1);
    font-weight: 700;
  }
  .time {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    margin-top: 8px;
    color: var(--t1);
  }
  .time input {
    width: 44px;
    padding: 2px 4px;
    margin: 0 2px;
    border-radius: 4px;
    border: 1px solid var(--bg2);
    background: var(--bg1);
    color: var(--t2);
    font: inherit;
  }
  .foot {
    display: flex;
    gap: 6px;
    margin-top: 8px;
    justify-content: flex-end;
  }
  button {
    padding: 2px 8px;
    border-radius: 6px;
    border: 1px solid var(--bg2);
    color: var(--t1);
    font-size: 11px;
  }
  button:hover:not(:disabled) {
    color: var(--hl1);
    border-color: var(--hl1);
  }
  button:disabled {
    opacity: 0.4;
  }
  .foot .primary {
    background: var(--hl1);
    border-color: var(--hl1);
    color: var(--bg1);
  }
</style>
