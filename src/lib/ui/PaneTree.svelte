<script lang="ts">
  import { setSizes, type PaneNode } from '../core/workspace';
  import PaneFrame from './PaneFrame.svelte';

  export let node: PaneNode;

  let container: HTMLDivElement;
  const MIN = 0.08;

  function startDrag(e: PointerEvent, index: number) {
    if (node.type !== 'split' || e.button !== 0) return;
    e.preventDefault();
    const split = node;
    const rect = container.getBoundingClientRect();
    const horizontal = split.direction === 'row';
    const total = horizontal ? rect.width : rect.height;
    const start = horizontal ? e.clientX : e.clientY;
    const initial = [...split.sizes];
    const pair = initial[index] + initial[index + 1];
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add(horizontal ? 'resizing-x' : 'resizing-y');

    const move = (ev: PointerEvent) => {
      const delta = ((horizontal ? ev.clientX : ev.clientY) - start) / total;
      const a = Math.min(Math.max(initial[index] + delta, MIN), pair - MIN);
      const sizes = [...initial];
      sizes[index] = a;
      sizes[index + 1] = pair - a;
      setSizes(split.id, sizes);
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      document.body.classList.remove('resizing-x', 'resizing-y');
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }

  function equalize(index: number) {
    if (node.type !== 'split') return;
    const sizes = [...node.sizes];
    const pair = sizes[index] + sizes[index + 1];
    sizes[index] = sizes[index + 1] = pair / 2;
    setSizes(node.id, sizes);
  }

  function onHandleKey(e: KeyboardEvent, index: number) {
    if (node.type !== 'split') return;
    const horizontal = node.direction === 'row';
    const dec = horizontal ? 'ArrowLeft' : 'ArrowUp';
    const inc = horizontal ? 'ArrowRight' : 'ArrowDown';
    if (e.key !== dec && e.key !== inc) return;
    e.preventDefault();
    const step = e.key === inc ? 0.03 : -0.03;
    const sizes = [...node.sizes];
    const pair = sizes[index] + sizes[index + 1];
    sizes[index] = Math.min(Math.max(sizes[index] + step, MIN), pair - MIN);
    sizes[index + 1] = pair - sizes[index];
    setSizes(node.id, sizes);
  }
</script>

{#if node.type === 'pane'}
  <PaneFrame pane={node} />
{:else}
  <div class="split" class:row={node.direction === 'row'} class:column={node.direction === 'column'} bind:this={container}>
    {#each node.children as child, i (child.id)}
      <div class="cell" style="flex: {node.sizes[i]} 1 0px;">
        <svelte:self node={child} />
      </div>
      {#if i < node.children.length - 1}
        <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
        <div
          class="divider"
          role="separator"
          tabindex="0"
          aria-orientation={node.direction === 'row' ? 'vertical' : 'horizontal'}
          aria-label="Resize panes (double click to equalize)"
          on:pointerdown={(e) => startDrag(e, i)}
          on:dblclick={() => equalize(i)}
          on:keydown={(e) => onHandleKey(e, i)}
        />
      {/if}
    {/each}
  </div>
{/if}

<style>
  .split {
    display: flex;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }
  .split.row {
    flex-direction: row;
  }
  .split.column {
    flex-direction: column;
  }
  .cell {
    position: relative;
    display: flex;
    min-width: 0;
    min-height: 0;
  }
  .divider {
    flex: 0 0 6px;
    position: relative;
    z-index: 2;
    touch-action: none;
    outline: none;
  }
  .row > .divider {
    cursor: col-resize;
  }
  .column > .divider {
    cursor: row-resize;
  }
  .divider::after {
    content: '';
    position: absolute;
    inset: 0;
    margin: auto;
    border-radius: 2px;
    background: var(--hl1);
    opacity: 0;
    transition: opacity 0.15s;
  }
  .row > .divider::after {
    width: 2px;
  }
  .column > .divider::after {
    height: 2px;
  }
  .divider:hover::after,
  .divider:focus-visible::after {
    opacity: 0.8;
  }

  @media (max-width: 720px) {
    .split.row,
    .split.column {
      flex-direction: column;
      height: auto;
    }
    .cell {
      flex: none !important;
      min-height: 72vh;
    }
    .divider {
      flex-basis: 8px;
      pointer-events: none;
    }
  }
</style>
