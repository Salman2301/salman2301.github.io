<script lang="ts">
  import { tick } from 'svelte';
  import type { Config } from '../../core/types';
  import { activeTask, formatSpent, setActiveTask, tasks } from '../../core/tasks';
  import { openWidget } from '../../core/workspace';
  import {
    fmt, MODE_LABEL, pomodoro, pomodoroStats, remainingMs, reset, setAutoStart, setDurations, setMode, skip, toggle, todayKey,
    type Mode,
  } from './engine';

  export let paneId: string;
  export let focused = false;
  export let config: Config = {};
  export let updateConfig: (patch: Config) => void = () => {};
  $: void paneId, config, updateConfig;

  const MODES: Mode[] = ['focus', 'short', 'long'];
  let root: HTMLDivElement;
  let w = 0;
  let h = 0;
  let settings = false;

  $: total = $pomodoro.durations[$pomodoro.mode] * 60_000;
  $: progress = total ? 1 - $remainingMs / total : 0;
  // Breakpoints on the pane's height: the task and stats go first, then the
  // label and session dots, so the timer and its buttons always fit.
  $: compact = h > 0 && h < 330;
  $: tiny = h > 0 && h < 210;
  $: size = Math.max(
    64,
    Math.min(w - 24, h - (compact ? 100 : h > 360 ? 170 : 130), 300),
  );
  $: today = $pomodoroStats[todayKey()] ?? { minutes: 0, sessions: 0 };
  $: open = $tasks.filter((t) => !t.done);
  const R = 46;
  const CIRC = 2 * Math.PI * R;

  function onKey(e: KeyboardEvent) {
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
    if (e.key === ' ') {
      e.preventDefault();
      toggle();
    } else if (e.key === 'r') reset();
    else if (e.key === 's') skip();
  }

  let wasFocused = false;
  $: {
    if (focused && !wasFocused) tick().then(() => root?.focus({ preventScroll: true }));
    wasFocused = focused;
  }

  function num(e: Event) {
    return Number((e.target as HTMLInputElement).value);
  }
</script>

<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
<div class="pomo mode-{$pomodoro.mode}" bind:this={root} tabindex="0" on:keydown={onKey} bind:clientWidth={w} bind:clientHeight={h}>
  <div class="tabs" role="tablist">
    {#each MODES as m}
      <button role="tab" aria-selected={$pomodoro.mode === m} class:on={$pomodoro.mode === m} on:click={() => setMode(m)}>{MODE_LABEL[m]}</button>
    {/each}
  </div>

  <div class="dial" style="width:{size}px;height:{size}px">
    <svg viewBox="0 0 100 100">
      <circle class="track" cx="50" cy="50" r={R} />
      <circle class="bar" cx="50" cy="50" r={R} stroke-dasharray={CIRC} stroke-dashoffset={CIRC * (1 - progress)} />
    </svg>
    <div class="center">
      <span class="time" style="font-size:{size * 0.21}px">{fmt($remainingMs)}</span>
      {#if !tiny}
        <span class="label">{$pomodoro.running || $remainingMs === total ? MODE_LABEL[$pomodoro.mode] : 'paused'}</span>
        <span class="dots" aria-label="{$pomodoro.cycle % $pomodoro.longEvery} of {$pomodoro.longEvery} sessions">
          {#each Array($pomodoro.longEvery) as _, i}<span class:done={i < $pomodoro.cycle % $pomodoro.longEvery} />{/each}
        </span>
      {/if}
    </div>
  </div>

  <div class="controls">
    <button class="primary" on:click={toggle}>{$pomodoro.running ? 'pause' : 'start'}</button>
    <button on:click={reset}>reset</button>
    <button on:click={skip}>skip</button>
    <button class:on={settings} on:click={() => (settings = !settings)} aria-label="Settings">set</button>
  </div>

  {#if settings}
    <div class="settings">
      <label>focus <input type="number" min="1" max="180" value={$pomodoro.durations.focus} on:change={(e) => setDurations({ focus: num(e) })} /></label>
      <label>short <input type="number" min="1" max="60" value={$pomodoro.durations.short} on:change={(e) => setDurations({ short: num(e) })} /></label>
      <label>long <input type="number" min="1" max="90" value={$pomodoro.durations.long} on:change={(e) => setDurations({ long: num(e) })} /></label>
      <label class="check"><input type="checkbox" checked={$pomodoro.autoStart} on:change={(e) => setAutoStart(e.currentTarget.checked)} /> auto-start next</label>
    </div>
  {/if}

  {#if !compact}
    <div class="task">
      {#if open.length}
        <select value={$activeTask?.id ?? ''} on:change={(e) => setActiveTask(e.currentTarget.value || null)} aria-label="Task to focus on">
          <option value="">no task selected</option>
          {#each open as t (t.id)}<option value={t.id}>{t.text}{t.pomodoros ? ` (${t.pomodoros})` : ''}{t.spentMs ? ` · ${formatSpent(t.spentMs)}` : ''}</option>{/each}
        </select>
      {:else}
        <button class="link" on:click={() => openWidget('todo')}>add a task to focus on</button>
      {/if}
      {#if $activeTask}
        <span class="spent">{formatSpent($activeTask.spentMs)} on this task{$activeTask.pomodoros ? ` · ${$activeTask.pomodoros} pomodoros` : ''}</span>
      {/if}
    </div>
    <p class="stats">today: {today.sessions} sessions · {today.minutes} min · space start/pause · r reset · s skip</p>
  {/if}
</div>

<style>
  .pomo {
    height: 100%;
    overflow: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 12px;
    outline: none;
    color: var(--t2);
  }
  .tabs {
    display: flex;
    border: 1px solid var(--bg2);
    border-radius: 999px;
    padding: 2px;
  }
  .tabs button {
    padding: 2px 10px;
    border-radius: 999px;
    font-size: 12px;
    color: var(--t1);
  }
  .tabs button.on {
    background: var(--hl1);
    color: var(--bg1);
  }
  .pomo :global(*:focus:not(:focus-visible)) {
    outline: none;
  }
  .dial {
    position: relative;
    flex-shrink: 0;
  }
  svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }
  circle {
    fill: none;
    stroke-width: 4;
  }
  .track {
    stroke: color-mix(in srgb, var(--bg2) 70%, transparent);
  }
  .bar {
    stroke: var(--hl1);
    stroke-linecap: round;
    transition: stroke-dashoffset 0.3s linear;
  }
  .mode-short .bar,
  .mode-long .bar {
    stroke: #4ade80;
  }
  .center {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
  }
  .time {
    font-weight: 700;
    letter-spacing: 0.02em;
    font-variant-numeric: tabular-nums;
  }
  .label {
    font-size: 12px;
    color: var(--t1);
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }
  .dots {
    display: flex;
    gap: 5px;
    margin-top: 4px;
  }
  .dots span {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    border: 1px solid var(--t1);
  }
  .dots span.done {
    background: var(--hl1);
    border-color: var(--hl1);
  }
  .controls {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .controls button {
    padding: 4px 12px;
    border-radius: 6px;
    border: 1px solid var(--bg2);
    color: var(--t2);
    font-size: 12px;
  }
  .controls button:hover,
  .controls button.on {
    border-color: var(--hl1);
    color: var(--hl1);
  }
  .controls .primary {
    background: var(--hl1);
    border-color: var(--hl1);
    color: var(--bg1);
    min-width: 72px;
  }
  .controls .primary:hover {
    color: var(--bg1);
    filter: brightness(1.1);
  }
  .settings {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
    justify-content: center;
    font-size: 12px;
    color: var(--t1);
  }
  .settings input[type='number'] {
    width: 48px;
    margin-left: 4px;
    padding: 1px 4px;
    border-radius: 4px;
    border: 1px solid var(--bg2);
    background: var(--bg1);
    color: var(--t2);
    font: inherit;
  }
  .check input {
    accent-color: var(--hl1);
  }
  .task select {
    max-width: min(320px, 90vw);
    padding: 3px 6px;
    border-radius: 6px;
    border: 1px solid var(--bg2);
    background: var(--bg1);
    color: var(--t2);
    font: inherit;
    font-size: 12px;
  }
  .task {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .spent {
    font-size: 11px;
    color: var(--t1);
    font-variant-numeric: tabular-nums;
  }
  .link {
    font-size: 12px;
    color: var(--hl1);
    text-decoration: underline;
  }
  .stats {
    font-size: 11px;
    color: var(--t1);
    text-align: center;
  }
</style>
