<script lang="ts">
  import { get } from 'svelte/store';
  import './lib/core/theme';
  import { overlays } from './lib/core/registry';
  import { templatePickerOpen } from './lib/core/ui';
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
    switch (e.code) {
      case 'KeyT':
        handled();
        templatePickerOpen.update((v) => !v);
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
</script>

<svelte:window on:keydown|capture={onKeyDown} />

<div class="app">
  <TabBar />
  <main class="workspace">
    {#key $workspace.active}
      <PaneTree node={$workspace.root} />
    {/key}
  </main>
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
    .app {
      height: auto;
      min-height: 100dvh;
      overflow: visible;
    }
    .workspace {
      display: block;
      padding: 4px;
    }
    .app :global(.statusbar) {
      position: sticky;
      bottom: 0;
    }
  }
</style>
