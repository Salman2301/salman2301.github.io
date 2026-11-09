<script lang="ts">
  import { get } from 'svelte/store';
  import { overlays } from './lib/core/registry';
  import { openOverlay, templatePickerOpen } from './lib/core/ui';
  import { stepStation, toggleRadio } from './lib/widgets/radio/player';
  import { onMount } from 'svelte';
  import { startReminders } from './lib/core/reminders';
  import { isMobile, startViewport } from './lib/core/device';
  import { startScreensaver } from './lib/core/screensaver';
  import { cycleThemeHere } from './lib/core/spaces';
  import { startScreenTime } from './lib/core/screentime';
  import { startPwa } from './lib/core/pwa';
  import { startSync } from './lib/core/sync';
  import {
    closePane,
    focusNeighbour,
    focusPane,
    leaf,
    leaves,
    newTab,
    splitPane,
    stepTab,
    toggleMaximize,
    workspace,
  } from './lib/core/workspace';
  import MobileDock from './lib/ui/MobileDock.svelte';
  import MobilePanes from './lib/ui/MobilePanes.svelte';
  import PaneTree from './lib/ui/PaneTree.svelte';
  import StatusBar from './lib/ui/StatusBar.svelte';
  import TabBar from './lib/ui/TabBar.svelte';
  import TemplatePicker from './lib/ui/TemplatePicker.svelte';
  import Toasts from './lib/ui/Toasts.svelte';

  /**
   * Global tmux-style shortcuts. Alt (Option on macOS) + key, matched on
   * e.code so the Option-key characters on macOS do not get in the way.
   */
  function onKeyDown(e: KeyboardEvent) {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    const s = get(workspace);
    const focused = s.focused ?? leaves(s.root)[0]?.id;
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    // Inside a text field, Option+arrows move by word. Let those through.
    if (e.key.startsWith('Arrow') && (e.target as HTMLElement)?.closest?.('textarea, input, [contenteditable="true"]')) return;
    switch (e.code) {
      case 'KeyY':
        handled();
        cycleThemeHere(e.shiftKey);
        return;
      case 'KeyT':
        handled();
        templatePickerOpen.update((v) => !v);
        return;
      case 'KeyP':
        handled();
        toggleRadio();
        return;
      case 'Period':
        handled();
        stepStation(1);
        return;
      case 'Comma':
        handled();
        stepStation(-1);
        return;
      case 'Slash':
        handled();
        openOverlay.set('keys');
        return;
      case 'KeyS':
        handled();
        startScreensaver();
        return;
      case 'Backslash':
      case 'Enter':
        handled();
        if (focused) splitPane(focused, 'row', leaf('terminal'));
        return;
      case 'Minus':
        handled();
        if (focused) splitPane(focused, 'column', leaf('terminal'));
        return;
      case 'KeyW':
        handled();
        if (focused) closePane(focused);
        return;
      case 'KeyN':
        handled();
        newTab();
        return;
      case 'BracketLeft':
        handled();
        return stepTab(-1);
      case 'BracketRight':
        handled();
        return stepTab(1);
      case 'KeyM':
      case 'KeyF':
        handled();
        toggleMaximize();
        return;
      case 'ArrowLeft':
        handled();
        return focusNeighbour('left');
      case 'ArrowRight':
        handled();
        return focusNeighbour('right');
      case 'ArrowUp':
        handled();
        return focusNeighbour('up');
      case 'ArrowDown':
        handled();
        return focusNeighbour('down');
    }
    const digit = /^Digit([1-9])$/.exec(e.code);
    if (digit) {
      const target = leaves(s.root)[Number(digit[1]) - 1];
      if (target) {
        handled();
        focusPane(target.id);
      }
    }
  }

  onMount(() => {
    startViewport();
    startReminders();
    startScreenTime();
    startPwa();
    startSync();
  });
</script>

<svelte:window on:keydown|capture={onKeyDown} />

<div class="app">
  <TabBar />
  <main class="workspace">
    {#key $workspace.active}
      {#if $isMobile}
        <!-- phones: one pane per screen, swipe between them -->
        <MobilePanes />
      {:else}
        <PaneTree node={$workspace.root} />
      {/if}
    {/key}
  </main>
  {#if $isMobile}<MobileDock />{/if}
  <StatusBar />
</div>

<TemplatePicker />
<Toasts />
{#each overlays as o (o.id)}
  <svelte:component this={o.component} />
{/each}

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
    width: 100vw;
    overflow: hidden;
    background: var(--bg1);
  }
  .workspace {
    flex: 1;
    min-height: 0;
    display: flex;
    padding: 6px;
  }
  @media (max-width: 720px) {
    /* As tall as the visible screen (it shrinks when the keyboard opens); the page itself never scrolls. */
    .app {
      position: fixed;
      inset: 0 0 auto 0;
      height: var(--vvh, 100dvh);
      box-sizing: border-box;
      /* notches and the home bar, when installed as an app */
      padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
    }
    .workspace {
      padding: 0;
    }
  }
</style>
