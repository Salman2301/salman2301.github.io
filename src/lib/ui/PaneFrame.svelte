<svelte:options immutable={true} />

<script lang="ts">
  import { getWidget, widgets } from '../core/registry';
  import type { Config } from '../core/types';
  import {
    canClosePane,
    closePane,
    focusPane,
    leaf,
    replaceWidget,
    splitPane,
    swapPanes,
    toggleMaximize,
    updatePaneConfig,
    workspace,
    type PaneLeaf,
  } from '../core/workspace';
  import MissingWidget from './MissingWidget.svelte';

  export let pane: PaneLeaf;

  $: def = getWidget(pane.widget);
  $: config = { ...(def?.defaultConfig ?? {}), ...(pane.config ?? {}) } as Config;
  $: focused = $workspace.focused === pane.id;
  $: maximized = $workspace.maximized === pane.id;
  $: title = def ? (def.paneTitle?.(config) ?? def.title) : pane.widget;
  $: index = indexOf(pane.id, $workspace.root);

  function indexOf(id: string, root: typeof $workspace.root): number {
    const ids: string[] = [];
    const walk = (n: typeof root) => (n.type === 'pane' ? ids.push(n.id) : n.children.forEach(walk));
    walk(root);
    return ids.indexOf(id) + 1;
  }

  const updateConfig = (patch: Config) => updatePaneConfig(pane.id, patch);

  let menuOpen = false;
  let dragOver = false;

  function choose(id: string) {
    menuOpen = false;
    const w = getWidget(id);
    replaceWidget(pane.id, id, w?.defaultConfig ?? {});
  }

  function onDragStart(e: DragEvent) {
    e.dataTransfer?.setData('text/x-pane', pane.id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }
  function onDragOver(e: DragEvent) {
    if (e.dataTransfer?.types.includes('text/x-pane')) {
      e.preventDefault();
      dragOver = true;
    }
  }
  function onDrop(e: DragEvent) {
    dragOver = false;
    const from = e.dataTransfer?.getData('text/x-pane');
    if (from && from !== pane.id) {
      e.preventDefault();
      swapPanes(from, pane.id);
    }
  }

  function clickOutside(node: HTMLElement) {
    const handler = (e: PointerEvent) => {
      if (!node.contains(e.target as Node)) menuOpen = false;
    };
    document.addEventListener('pointerdown', handler, true);
    return { destroy: () => document.removeEventListener('pointerdown', handler, true) };
  }
</script>

<section
  class="frame"
  class:focused
  class:maximized
  class:drag-over={dragOver}
  data-pane-id={pane.id}
  data-widget={pane.widget}
  on:pointerdown|capture={() => focusPane(pane.id)}
  on:focusin={() => focusPane(pane.id)}
  on:dragover={onDragOver}
  on:dragleave={() => (dragOver = false)}
  on:drop={onDrop}
>
  <header draggable="true" on:dragstart={onDragStart} on:dblclick={() => toggleMaximize(pane.id)}>
    <span class="index">{index}</span>
    <div class="title-wrap" use:clickOutside>
      <button class="title" on:click={() => (menuOpen = !menuOpen)} title="Change widget" aria-haspopup="menu" aria-expanded={menuOpen}>
        <span class="icon">{def?.icon ?? '?'}</span>
        <span class="name">{title}</span>
        <span class="caret">▾</span>
      </button>
      {#if menuOpen}
        <div class="menu" role="menu">
          {#each widgets.filter((w) => !w.hidden) as w (w.id)}
            <button role="menuitem" class:current={w.id === pane.widget} on:click={() => choose(w.id)}>
              <span class="icon">{w.icon}</span>
              <span class="mname">{w.title}</span>
              <span class="mdesc">{w.description}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
    <div class="spacer" />
    <div class="actions">
      <button title="Split right (Alt+\)" aria-label="Split right" on:click={() => splitPane(pane.id, 'row', leaf('terminal'))}>
        <svg viewBox="0 0 16 16"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" /><line x1="8" y1="2.5" x2="8" y2="13.5" /></svg>
      </button>
      <button title="Split down (Alt+-)" aria-label="Split down" on:click={() => splitPane(pane.id, 'column', leaf('terminal'))}>
        <svg viewBox="0 0 16 16"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" /><line x1="1.5" y1="8" x2="14.5" y2="8" /></svg>
      </button>
      <button title={maximized ? 'Restore (Alt+M)' : 'Maximize (Alt+M)'} aria-label="Maximize" on:click={() => toggleMaximize(pane.id)}>
        {#if maximized}
          <svg viewBox="0 0 16 16"><rect x="4.5" y="1.5" width="10" height="10" rx="1.5" /><path d="M1.5 5.5v8a1 1 0 0 0 1 1h8" /></svg>
        {:else}
          <svg viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12" rx="1.5" /></svg>
        {/if}
      </button>
      <button
        class="close"
        title={canClosePane($workspace) ? 'Close (Alt+W)' : 'The only pane of the only tab stays open'}
        aria-label="Close pane"
        disabled={!canClosePane($workspace)}
        on:click={() => closePane(pane.id)}
      >
        <svg viewBox="0 0 16 16"><line x1="3.5" y1="3.5" x2="12.5" y2="12.5" /><line x1="12.5" y1="3.5" x2="3.5" y2="12.5" /></svg>
      </button>
    </div>
  </header>

  <div class="body">
    {#if def}
      <svelte:component this={def.component} paneId={pane.id} {focused} {config} {updateConfig} />
    {:else}
      <MissingWidget widgetId={pane.widget} on:choose={(e) => choose(e.detail)} />
    {/if}
  </div>
</section>

<style>
  .frame {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    background: var(--bg1);
    border: 1px solid color-mix(in srgb, var(--bg2) 85%, transparent);
    border-radius: 8px;
    overflow: hidden;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .frame.focused {
    border-color: var(--hl1);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--hl1) 30%, transparent), 0 0 24px -12px var(--hl1);
  }
  .frame.maximized {
    position: fixed;
    inset: 6px 6px 34px 6px;
    z-index: 40;
    width: auto;
    height: auto;
  }
  .frame.drag-over {
    outline: 2px dashed var(--hl1);
    outline-offset: -4px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    flex: 0 0 28px;
    padding: 0 4px 0 8px;
    font-size: 12px;
    color: var(--t1);
    background: color-mix(in srgb, var(--bg2) 35%, var(--bg1));
    border-bottom: 1px solid color-mix(in srgb, var(--bg2) 70%, transparent);
    user-select: none;
    cursor: grab;
  }
  .focused header {
    color: var(--t2);
  }
  .index {
    min-width: 16px;
    height: 16px;
    display: inline-grid;
    place-items: center;
    border-radius: 4px;
    font-size: 10px;
    background: color-mix(in srgb, var(--bg2) 80%, transparent);
    color: var(--t1);
  }
  .focused .index {
    background: var(--hl1);
    color: var(--bg1);
  }
  .title-wrap {
    position: relative;
    min-width: 0;
  }
  .title {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 6px;
    border-radius: 4px;
    color: inherit;
    max-width: 100%;
  }
  .title:hover {
    background: color-mix(in srgb, var(--bg2) 70%, transparent);
  }
  .icon {
    color: var(--hl1);
    font-weight: 700;
    min-width: 14px;
    text-align: center;
  }
  .name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .caret {
    opacity: 0.6;
    font-size: 10px;
  }
  .menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 50;
    width: 300px;
    max-height: 60vh;
    overflow: auto;
    padding: 4px;
    border-radius: 8px;
    border: 1px solid var(--bg2);
    background: var(--bg1);
    box-shadow: 0 16px 40px -12px rgba(0, 0, 0, 0.6);
    cursor: default;
  }
  .menu button {
    display: grid;
    grid-template-columns: 22px 1fr;
    grid-template-rows: auto auto;
    column-gap: 6px;
    width: 100%;
    text-align: left;
    padding: 6px 8px;
    border-radius: 6px;
    color: var(--t2);
  }
  .menu button .icon {
    grid-row: span 2;
    align-self: center;
  }
  .menu button:hover,
  .menu button.current {
    background: color-mix(in srgb, var(--bg2) 70%, transparent);
  }
  .mname {
    font-size: 12px;
  }
  .mdesc {
    font-size: 11px;
    color: var(--t1);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .spacer {
    flex: 1;
  }
  .actions {
    display: flex;
    gap: 2px;
    opacity: 0.55;
    transition: opacity 0.15s;
  }
  .frame:hover .actions,
  .focused .actions {
    opacity: 1;
  }
  .actions button {
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    border-radius: 4px;
    color: var(--t1);
  }
  .actions button:hover {
    color: var(--t2);
    background: color-mix(in srgb, var(--bg2) 80%, transparent);
  }
  .actions .close:hover {
    color: #fff;
    background: #e5484d;
  }
  svg {
    width: 13px;
    height: 13px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linecap: round;
  }
  .body {
    position: relative;
    flex: 1;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    cursor: default;
  }
  @media (max-width: 720px) {
    /* Touch has no hover, so the header actions are always visible and easier to hit. */
    header {
      height: 36px;
      flex-basis: 36px;
      gap: 4px;
    }
    .title {
      padding: 6px 8px;
    }
    .actions {
      opacity: 1;
    }
    .actions button {
      width: 32px;
      height: 32px;
    }
    .actions button:not(.close) {
      display: none;
    }
    .actions button:nth-child(3) {
      display: grid;
    }
    /* Stay inside a narrow screen: never wider than the pane's right edge. */
    .menu {
      width: min(300px, calc(100vw - 48px));
    }
  }
</style>
