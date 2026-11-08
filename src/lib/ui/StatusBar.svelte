<script lang="ts">
  import { onDestroy } from 'svelte';
  import { getWidget } from '../core/registry';
  import { statusItems } from '../core/status';
  import { findTemplate } from '../core/templates';
  import { setTheme, themeNames, themeStore } from '../core/theme';
  import { templatePickerOpen } from '../core/ui';
  import { focusPane, leaves, workspace } from '../core/workspace';
  import ClockPanel from './ClockPanel.svelte';

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
  <label class="seg theme" title="Theme (or type: theme <name>)">
    <span class="theme-label">theme</span>
    <select aria-label="Theme" value={$themeStore} on:change={(e) => setTheme(e.currentTarget.value)}>
      {#each themeNames as name}<option value={name}>{name}</option>{/each}
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
    .clock .day {
      display: none;
    }
    .theme select {
      max-width: 110px;
    }
  }
</style>
