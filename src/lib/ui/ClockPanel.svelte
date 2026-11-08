<script lang="ts">
  import { onDestroy } from 'svelte';
  import { MODE_LABEL, fmt, pomodoro, pomodoroStats, remainingMs, todayKey, toggle, reset } from '../widgets/pomodoro/engine';
  import { openWidget } from '../core/workspace';

  /** Opened from the clock in the status bar. Closes on Escape or an outside click. */
  export let open = false;

  const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

  let now = new Date();
  let timer: ReturnType<typeof setInterval> | undefined;
  let root: HTMLDivElement;
  // the month shown in the calendar, and the date we are looking at
  let viewYear = now.getFullYear();
  let viewMonth = now.getMonth();

  $: if (open) start();
  $: if (!open) stop();

  function start() {
    if (timer) return;
    now = new Date();
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();
    timer = setInterval(() => (now = new Date()), 1000);
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = undefined;
  }

  /** Six rows of day cells for the view month, weeks starting on Monday. Null = blank. */
  $: cells = (() => {
    const first = new Date(viewYear, viewMonth, 1);
    const offset = (first.getDay() + 6) % 7;
    const days = new Date(viewYear, viewMonth + 1, 0).getDate();
    const out: (number | null)[] = Array(offset).fill(null);
    for (let d = 1; d <= days; d++) out.push(d);
    while (out.length % 7 !== 0) out.push(null);
    return out;
  })();

  const isToday = (d: number | null) =>
    d !== null && d === now.getDate() && viewMonth === now.getMonth() && viewYear === now.getFullYear();

  function shift(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    viewYear = d.getFullYear();
    viewMonth = d.getMonth();
  }
  function goToday() {
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();
  }

  function onWindowDown(e: PointerEvent) {
    if (!open) return;
    const target = e.target as Node;
    // the clock button itself toggles the panel, so ignore clicks on it
    if (root && !root.contains(target) && !(target as HTMLElement).closest?.('[data-clock-toggle]')) open = false;
  }
  function onWindowKey(e: KeyboardEvent) {
    if (open && e.key === 'Escape') open = false;
  }

  $: today = $pomodoroStats[todayKey()] ?? { minutes: 0, sessions: 0 };
  $: total = $pomodoro.durations[$pomodoro.mode] * 60_000;
  $: active = $pomodoro.running || $remainingMs !== total;

  onDestroy(stop);
</script>

<svelte:window on:pointerdown|capture={onWindowDown} on:keydown={onWindowKey} />

{#if open}
  <div class="panel" bind:this={root} role="dialog" aria-label="Clock, calendar and timer">
    <div class="clock">
      <span class="hm">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      <span class="sec">:{String(now.getSeconds()).padStart(2, '0')}</span>
      <span class="date">{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
    </div>

    <div class="cal">
      <div class="cal-head">
        <button on:click={() => shift(-1)} aria-label="Previous month">‹</button>
        <button class="month" on:click={goToday} title="Back to today">
          {new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </button>
        <button on:click={() => shift(1)} aria-label="Next month">›</button>
      </div>
      <div class="grid">
        {#each WEEKDAYS as w}<span class="wd">{w}</span>{/each}
        {#each cells as d}
          <span class="day" class:blank={d === null} class:today={isToday(d)}>{d ?? ''}</span>
        {/each}
      </div>
    </div>

    <div class="timer">
      <div class="row">
        <span class="label">{active ? (($pomodoro.running ? '' : 'paused · ') + MODE_LABEL[$pomodoro.mode]) : 'timer'}</span>
        <span class="time" class:live={$pomodoro.running}>{fmt($remainingMs)}</span>
      </div>
      <div class="actions">
        <button class="primary" on:click={toggle}>{$pomodoro.running ? 'pause' : 'start'}</button>
        <button on:click={reset} disabled={!active}>reset</button>
        <button on:click={() => { openWidget('pomodoro'); open = false; }}>open pomodoro</button>
      </div>
      <p class="today">today: {today.sessions} sessions · {today.minutes} min focused</p>
    </div>
  </div>
{/if}

<style>
  .panel {
    position: fixed;
    right: 8px;
    bottom: 34px;
    z-index: 60;
    width: 296px;
    max-width: calc(100vw - 16px);
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    border-radius: 10px;
    border: 1px solid var(--bg2);
    background: var(--bg1);
    box-shadow: 0 16px 40px -12px rgba(0, 0, 0, 0.6);
    color: var(--t2);
    font-size: 12px;
  }
  .clock {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 6px;
  }
  .hm {
    font-size: 32px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--hl1);
  }
  .sec {
    color: var(--t1);
    font-variant-numeric: tabular-nums;
  }
  .date {
    width: 100%;
    color: var(--t1);
  }
  .cal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .cal-head button {
    width: 28px;
    height: 26px;
    border-radius: 6px;
    color: var(--t1);
    font-size: 16px;
  }
  .cal-head button:hover {
    color: var(--hl1);
    background: color-mix(in srgb, var(--bg2) 60%, transparent);
  }
  .cal-head .month {
    width: auto;
    font-size: 12px;
    color: var(--t2);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
    text-align: center;
  }
  .wd {
    padding: 2px 0;
    color: var(--t1);
    font-size: 10px;
    text-transform: uppercase;
  }
  .day {
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    font-variant-numeric: tabular-nums;
  }
  .day.blank {
    visibility: hidden;
  }
  .day.today {
    background: var(--hl1);
    color: var(--bg1);
    font-weight: 700;
  }
  .timer {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px dashed color-mix(in srgb, var(--bg2) 80%, transparent);
  }
  .row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  .label {
    color: var(--t1);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 11px;
  }
  .time {
    font-size: 22px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .time.live {
    color: var(--hl1);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .actions button {
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid var(--bg2);
    color: var(--t2);
  }
  .actions button:hover:not(:disabled) {
    color: var(--hl1);
    border-color: var(--hl1);
  }
  .actions button:disabled {
    opacity: 0.4;
  }
  .actions .primary {
    background: var(--hl1);
    border-color: var(--hl1);
    color: var(--bg1);
  }
  .actions .primary:hover {
    color: var(--bg1);
  }
  .today {
    color: var(--t1);
    font-size: 11px;
  }
</style>
