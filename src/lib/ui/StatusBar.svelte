<script lang="ts">
  import { onDestroy } from 'svelte';
  import { getWidget } from '../core/registry';
  import { statusItems } from '../core/status';
  import { findTemplate } from '../core/templates';
  import { cycleThemeMode, darkThemes, lightThemes, setTheme, themeMode, themeStore } from '../core/theme';
  import { templatePickerOpen } from '../core/ui';
  import { focusPane, leaves, workspace } from '../core/workspace';
  import ClockPanel from './ClockPanel.svelte';
  import MusicControl from './MusicControl.svelte';
  import SpaceMenu from './SpaceMenu.svelte';

  let now = new Date();
  const t = setInterval(() => (now = new Date()), 1000);
  onDestroy(() => clearInterval(t));

  let clockOpen = false;

  $: panes = leaves($workspace.root);
  $: templateName = $workspace.template ? findTemplate($workspace.template)?.title ?? $workspace.template : 'custom';
  $: time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  $: day = now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
</script>

<footer class="statusbar">
  <button class="seg brand" on:click={() => templatePickerOpen.set(true)} title="Choose a template (Alt+T)">
    <span class="dot" />{templateName}
  </button>
  <div class="windows">
    {#each panes as p, i (p.id)}
      <button class="win" class:active={p.id === $workspace.focused} on:click={() => focusPane(p.id)} title="Focus pane (Alt+{i + 1})">
        {i + 1}:{getWidget(p.widget)?.title.toLowerCase() ?? p.widget}{p.id === $workspace.focused ? '*' : ''}
      </button>
    {/each}
  </div>
  <div class="spacer" />
  {#each $statusItems as item (item.id)}
    {#if item.onClick}
      <button class="seg item tone-{item.tone ?? 'normal'}" title={item.title} on:click={item.onClick}>{item.text}</button>
    {:else}
      <span class="seg item tone-{item.tone ?? 'normal'}" title={item.title}>{item.text}</span>
    {/if}
  {/each}
  <SpaceMenu />
  <MusicControl />
  <button
    class="seg mode"
    on:click={cycleThemeMode}
    title="Theme mode: {$themeMode}{$themeMode === 'system' ? ' (follows your OS)' : ''}. Click for {$themeMode === 'system' ? 'dark' : $themeMode === 'dark' ? 'light' : 'system'}."
    aria-label="Theme mode: {$themeMode}"
  >
    <svg viewBox="0 0 16 16" aria-hidden="true">
      {#if $themeMode === 'system'}
        <rect x="2" y="3" width="12" height="8.5" rx="1.2" /><path d="M6 14h4M8 11.5V14" />
      {:else if $themeMode === 'dark'}
        <path d="M13 9.6A5.5 5.5 0 0 1 6.4 3a5.5 5.5 0 1 0 6.6 6.6Z" />
      {:else}
        <circle cx="8" cy="8" r="3" /><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
      {/if}
    </svg>
    <span class="mode-label">{$themeMode}</span>
  </button>
  <label class="seg theme" title="Theme (or type: theme <name>)">
    <span class="theme-label">theme</span>
    <select aria-label="Theme" value={$themeStore} on:change={(e) => setTheme(e.currentTarget.value)}>
      <optgroup label="dark">{#each darkThemes as name}<option value={name}>{name}</option>{/each}</optgroup>
      <optgroup label="light">{#each lightThemes as name}<option value={name}>{name}</option>{/each}</optgroup>
    </select>
  </label>
  <button class="seg clock" data-clock-toggle class:open={clockOpen} aria-expanded={clockOpen} title="Clock, calendar and timer" on:click={() => (clockOpen = !clockOpen)}>
    <span class="day">{day}</span>
    <b>{time}</b>
  </button>
</footer>

<ClockPanel bind:open={clockOpen} />

<style>
  .statusbar {
    display: flex;
    align-items: stretch;
    height: 26px;
    flex: 0 0 26px;
    font-size: 12px;
    color: var(--t1);
    background: color-mix(in srgb, var(--bg2) 40%, var(--bg1));
    border-top: 1px solid color-mix(in srgb, var(--bg2) 80%, transparent);
    overflow: hidden;
    white-space: nowrap;
    user-select: none;
  }
  .seg {
    display: flex;
    align-items: center;
    padding: 0 10px;
    color: inherit;
  }
  button.seg:hover,
  .win:hover {
    color: var(--t2);
    background: color-mix(in srgb, var(--bg2) 70%, transparent);
  }
  .brand {
    gap: 6px;
    background: var(--hl1);
    color: var(--bg1) !important;
    font-weight: 600;
  }
  .brand:hover {
    filter: brightness(1.1);
    background: var(--hl1) !important;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--bg1);
  }
  .windows {
    display: flex;
    overflow: hidden;
  }
  .win {
    padding: 0 8px;
    color: var(--t1);
  }
  .win.active {
    color: var(--hl1);
  }
  .spacer {
    flex: 1;
  }
  .tone-accent {
    color: var(--hl1);
  }
  .tone-muted {
    opacity: 0.7;
  }
  .item {
    border-left: 1px solid color-mix(in srgb, var(--bg2) 80%, transparent);
  }
  .clock {
    gap: 8px;
    color: var(--t1);
    border-left: 1px solid color-mix(in srgb, var(--bg2) 80%, transparent);
  }
  .clock b {
    color: var(--t2);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .clock.open,
  .clock:hover {
    color: var(--hl1);
  }
  .mode {
    gap: 5px;
    border-left: 1px solid color-mix(in srgb, var(--bg2) 80%, transparent);
  }
  .mode svg {
    width: 13px;
    height: 13px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .mode-label {
    font-size: 11px;
  }
  .theme {
    gap: 6px;
    padding: 0 6px 0 10px;
    border-left: 1px solid color-mix(in srgb, var(--bg2) 80%, transparent);
  }
  .theme-label {
    opacity: 0.7;
  }
  .theme select {
    max-width: 150px;
    height: 100%;
    padding: 0 4px;
    background: transparent;
    color: var(--t2);
    border: 0;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    outline: none;
  }
  .theme select:focus-visible {
    color: var(--hl1);
  }
  .theme option {
    background: var(--bg1);
    color: var(--t2);
  }
  @media (max-width: 720px) {
    .windows,
    .theme-label,
    .mode-label,
    .clock .day {
      display: none;
    }
    .theme select {
      max-width: 110px;
    }
  }
</style>
