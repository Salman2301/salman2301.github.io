<script lang="ts">
  import { onDestroy } from 'svelte';
  import { getWidget } from '../core/registry';
  import { statusItems } from '../core/status';
  import { findTemplate } from '../core/templates';
  import { themeStore } from '../core/theme';
  import { openOverlay, templatePickerOpen } from '../core/ui';
  import { focusPane, leaves, workspace } from '../core/workspace';

  let now = new Date();
  const t = setInterval(() => (now = new Date()), 1000);
  onDestroy(() => clearInterval(t));

  $: panes = leaves($workspace.root);
  $: templateName = $workspace.template ? findTemplate($workspace.template)?.title ?? $workspace.template : 'custom';
  $: time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
  <button class="seg hint" on:click={() => openOverlay.set('palette')} title="Command palette">ctrl+k</button>
  <span class="seg theme" title="Theme (type: theme)">{$themeStore}</span>
  <span class="seg clock">{time}</span>
</footer>

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
    color: var(--t2);
    border-left: 1px solid color-mix(in srgb, var(--bg2) 80%, transparent);
  }
  .theme,
  .hint {
    border-left: 1px solid color-mix(in srgb, var(--bg2) 80%, transparent);
  }
  @media (max-width: 720px) {
    .windows,
    .theme,
    .hint {
      display: none;
    }
  }
</style>
