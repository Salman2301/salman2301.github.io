<script lang="ts">
  import { getWidget } from '../core/registry';
  import type { PaneNode } from '../core/workspace';

  /** A tiny, non-interactive drawing of a pane tree, used by the template picker. */
  export let node: PaneNode;
</script>

{#if node.type === 'pane'}
  <div class="mini-pane" title={getWidget(node.widget)?.title ?? node.widget}>
    <span class="glyph">{getWidget(node.widget)?.icon ?? '?'}</span>
    <span class="label">{getWidget(node.widget)?.title ?? node.widget}</span>
  </div>
{:else}
  <div class="mini-split" class:row={node.direction === 'row'}>
    {#each node.children as child, i}
      <div class="mini-cell" style="flex: {node.sizes[i]} 1 0px;">
        <svelte:self node={child} />
      </div>
    {/each}
  </div>
{/if}

<style>
  .mini-split {
    display: flex;
    flex-direction: column;
    gap: 3px;
    width: 100%;
    height: 100%;
  }
  .mini-split.row {
    flex-direction: row;
  }
  .mini-cell {
    display: flex;
    min-width: 0;
    min-height: 0;
  }
  .mini-pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-width: 0;
    border-radius: 3px;
    border: 1px solid color-mix(in srgb, var(--hl1) 45%, transparent);
    background: color-mix(in srgb, var(--hl1) 8%, var(--bg1));
    overflow: hidden;
  }
  .glyph {
    color: var(--hl1);
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
  }
  .label {
    font-size: 9px;
    color: var(--t1);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    padding: 0 2px;
  }
</style>
