<script lang="ts">
  import { onDestroy } from 'svelte';
  import { MODE_LABEL, fmt, pomodoro, pomodoroStats, remainingMs, todayKey, toggle, reset } from '../widgets/pomodoro/engine';
  import { openWidget } from '../core/workspace';
  import { ymd } from '../core/dates';
  import { openMention } from '../core/mentions';
  import { calendarList, inList, reminders, type Reminder } from '../core/reminders';
  import { projects } from '../core/tasks';
  import { calendarRequest } from '../core/ui';
  import { activeSpace, ALL, currentSpace } from '../core/spaces';

  /** Opened from the clock in the status bar. Closes on Escape or an outside click. */
  export let open = false;

  const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

  let now = new Date();
  let timer: ReturnType<typeof setInterval> | undefined;
  let root: HTMLDivElement;
  // the month shown in the calendar, and the date we are looking at
  let viewYear = now.getFullYear();
  let viewMonth = now.getMonth();
  /** The day whose reminders are listed under the calendar, "YYYY-MM-DD". */
  let selected = ymd(now);

  $: if (open) start();
  $: if (!open) stop();

  function start() {
    if (timer) return;
    now = new Date();
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();
    selected = ymd(now);
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

  const keyOf = (d: number) => `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  // Reminders in the chosen list, grouped by day.
  // The space chosen in the status bar wins over the calendar's own pick.
  $: shown = inList($reminders, $activeSpace !== ALL ? $activeSpace : $calendarList);
  $: byDay = shown.reduce<Record<string, Reminder[]>>((m, r) => ((m[r.day] ??= []).push(r), m), {});
  $: agenda = byDay[selected] ?? [];
  // A list that was deleted falls back to all lists.
  $: if ($calendarList !== 'all' && !$projects.some((p) => p.id === $calendarList)) calendarList.set('all');

  // A date link in a note opens the calendar on that day.
  $: if ($calendarRequest) showDay($calendarRequest);
  function showDay(day: string) {
    calendarRequest.set(null);
    open = true;
    start();
    const [y, m] = day.split('-').map(Number);
    viewYear = y;
    viewMonth = m - 1;
    selected = day;
  }

  function openReminder(r: Reminder) {
    openMention(r.kind, r.id);
    open = false;
  }

  function shift(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    viewYear = d.getFullYear();
    viewMonth = d.getMonth();
  }
  function goToday() {
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();
    selected = ymd(now);
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
          {#if d === null}
            <span class="day blank" />
          {:else}
            <button
              class="day"
              class:today={isToday(d)}
              class:picked={keyOf(d) === selected}
              class:has={!!byDay[keyOf(d)]}
              aria-label="{keyOf(d)}{byDay[keyOf(d)] ? `, ${byDay[keyOf(d)].length} reminders` : ''}"
              on:click={() => (selected = keyOf(d))}>{d}</button
            >
          {/if}
        {/each}
      </div>

      <div class="agenda">
        <div class="agenda-head">
          <span class="agenda-day">{new Date(`${selected}T00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
          {#if $currentSpace}
            <span class="space-tag" title="Change the space in the status bar">{$currentSpace.name}</span>
          {:else}
            <select bind:value={$calendarList} aria-label="Which space to show">
              <option value="all">all spaces</option>
              {#each $projects as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
            </select>
          {/if}
        </div>
        {#if agenda.length}
          <ul>
            {#each agenda as r (r.kind + r.id + r.day + (r.time ?? ''))}
              <li>
                <button class="rem" class:done={r.done} on:click={() => openReminder(r)} title={r.kind === 'task' ? 'Open this task' : 'Open this note'}>
                  <span class="rtime">{r.time ?? (r.kind === 'note' ? 'note' : 'all day')}</span>
                  <span class="rlabel">{r.label}</span>
                </button>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="none">no reminders. Type @tmrw or @monday in a task or a note.</p>
        {/if}
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
  .day {
    position: relative;
    color: var(--t2);
  }
  button.day:hover {
    background: color-mix(in srgb, var(--bg2) 60%, transparent);
  }
  .day.picked {
    box-shadow: inset 0 0 0 1px var(--hl1);
  }
  .day.has::after {
    content: '';
    position: absolute;
    bottom: 3px;
    left: 50%;
    width: 4px;
    height: 4px;
    margin-left: -2px;
    border-radius: 50%;
    background: var(--hl1);
  }
  .day.today {
    background: var(--hl1);
    color: var(--bg1);
    font-weight: 700;
  }
  .day.today.has::after {
    background: var(--bg1);
  }
  .agenda {
    margin-top: 10px;
  }
  .agenda-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 4px;
  }
  .agenda-day {
    color: var(--t2);
    font-weight: 600;
  }
  .agenda select {
    max-width: 140px;
    padding: 1px 4px;
    border: 1px solid var(--bg2);
    border-radius: 4px;
    background: var(--bg1);
    color: var(--t2);
    font: inherit;
    font-size: 11px;
  }
  .space-tag {
    color: var(--hl1);
    font-size: 11px;
  }
  .agenda ul {
    max-height: 130px;
    overflow: auto;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .rem {
    width: 100%;
    display: flex;
    gap: 8px;
    padding: 3px 4px;
    border-radius: 4px;
    text-align: left;
    color: var(--t2);
  }
  .rem:hover {
    background: color-mix(in srgb, var(--bg2) 60%, transparent);
    color: var(--hl1);
  }
  .rem.done .rlabel {
    text-decoration: line-through;
    color: var(--t1);
  }
  .rtime {
    flex: 0 0 auto;
    min-width: 44px;
    color: var(--t1);
    font-variant-numeric: tabular-nums;
  }
  .rlabel {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .none {
    color: var(--t1);
    font-size: 11px;
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
