<script lang="ts">
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import { itemKey, labelOf, type MediaItem, type Preset } from './media';

  export let presets: Preset[];
  export let recent: MediaItem[];
  export let current: MediaItem | null;
  /** Small print at the bottom, e.g. how the widget plays. */
  export let note = '';
  export let tab: 'presets' | 'recent' = 'presets';

  const dispatch = createEventDispatcher<{ pick: MediaItem; forget: MediaItem; clear: void; close: void }>();
  let panel: HTMLDivElement;

  $: currentKey = current ? itemKey(current) : '';

  function rows(): HTMLElement[] {
    return Array.from(panel?.querySelectorAll<HTMLElement>('[data-row]') ?? []);
  }

  async function focusCurrent() {
    await tick();
    const all = rows();
    const target = all.find((el) => el.dataset.key === currentKey) ?? all[0];
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'nearest' });
  }

  function showTab(next: 'presets' | 'recent') {
    tab = next;
    focusCurrent();
  }

  function onKey(e: KeyboardEvent) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const all = rows();
    const at = all.indexOf(document.activeElement as HTMLElement);
    const move = (i: number) => {
      e.preventDefault();
      e.stopPropagation();
      all[Math.max(0, Math.min(all.length - 1, i))]?.focus();
    };
    if (e.code === 'ArrowDown') move(at + 1);
    else if (e.code === 'ArrowUp') move(at <= 0 ? 0 : at - 1);
    else if (e.code === 'Home') move(0);
    else if (e.code === 'End') move(all.length - 1);
    else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      showTab(tab === 'presets' ? 'recent' : 'presets');
    } else if (e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      dispatch('close');
    }
  }

  onMount(focusCurrent);
</script>

<div class="menu" bind:this={panel} role="dialog" aria-label="Presets and recent" on:keydown={onKey}>
  <div class="tabs" role="tablist">
    <button role="tab" class="tab-btn" aria-selected={tab === 'presets'} class:on={tab === 'presets'} on:click={() => showTab('presets')}>presets</button>
    <button role="tab" class="tab-btn" aria-selected={tab === 'recent'} class:on={tab === 'recent'} on:click={() => showTab('recent')}>
      recent{recent.length ? ` ${recent.length}` : ''}
    </button>
    {#if tab === 'recent' && recent.length}
      <button class="clear" on:click={() => dispatch('clear')}>clear</button>
    {/if}
  </div>

  <ul class="rows">
    {#if tab === 'presets'}
      {#each presets as p (p.slug)}
        {@const key = itemKey(p.item)}
        <li>
          <button class="pick" class:on={key === currentKey} data-row data-key={key} on:click={() => dispatch('pick', p.item)}>
            <span class="name">{p.name}</span>
            <span class="meta">{p.note}</span>
          </button>
        </li>
      {/each}
    {:else}
      {#each recent as r (itemKey(r))}
        {@const key = itemKey(r)}
        <li class="recent-row">
          <button class="pick" class:on={key === currentKey} data-row data-key={key} on:click={() => dispatch('pick', r)}>
            <span class="name">{labelOf(r)}</span>
            <span class="meta">{r.kind}</span>
          </button>
          <button class="forget" title="Remove from recent" aria-label="Remove {labelOf(r)} from recent" on:click={() => dispatch('forget', r)}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </li>
      {:else}
        <li class="none">Nothing yet. Paste a link or pick a preset, and it shows up here.</li>
      {/each}
    {/if}
  </ul>

  <div class="foot">
    {#if note}<p class="note">{note}</p>{/if}
    <p class="keys"><kbd>/</kbd> link <kbd>p</kbd> menu <kbd>r</kbd> reload <kbd>↑↓</kbd> move <kbd>←→</kbd> tabs</p>
  </div>
</div>

<style>
  .menu {
    display: flex;
    flex-direction: column;
    min-height: 0;
    max-height: 100%;
    border-radius: 8px;
    border: 1px solid var(--bg2);
    background: var(--bg1);
    box-shadow: 0 16px 40px -12px color-mix(in srgb, var(--bg2) 60%, transparent);
    color: var(--t2);
    overflow: hidden;
  }
  .tabs {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px;
    border-bottom: 1px solid color-mix(in srgb, var(--bg2) 70%, transparent);
  }
  .tab-btn,
  .clear {
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11px;
    color: var(--t1);
  }
  .tab-btn.on {
    background: var(--hl1);
    color: var(--bg1);
  }
  .tab-btn:not(.on):hover,
  .clear:hover {
    color: var(--hl1);
  }
  .clear {
    margin-left: auto;
  }
  .rows {
    flex: 1;
    min-height: 0;
    overflow: auto;
    margin: 0;
    padding: 4px;
    list-style: none;
  }
  .recent-row {
    display: flex;
    align-items: stretch;
    gap: 2px;
  }
  .pick {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
    width: 100%;
    padding: 5px 8px;
    border-radius: 6px;
    text-align: left;
    border-left: 2px solid transparent;
  }
  .pick:hover,
  .pick:focus-visible {
    background: color-mix(in srgb, var(--bg2) 60%, transparent);
    outline: none;
  }
  .pick.on {
    border-left-color: var(--hl1);
    background: color-mix(in srgb, var(--hl1) 12%, transparent);
  }
  .name,
  .meta {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .name {
    font-size: 12px;
  }
  .pick.on .name {
    color: var(--hl1);
  }
  .meta {
    font-size: 10.5px;
    color: var(--t1);
  }
  .forget {
    flex: 0 0 26px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    color: var(--t1);
  }
  .forget:hover {
    color: var(--hl1);
    background: color-mix(in srgb, var(--bg2) 60%, transparent);
  }
  .forget svg {
    width: 11px;
    height: 11px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
  }
  .none {
    padding: 12px 8px;
    font-size: 11px;
    color: var(--t1);
    text-align: center;
  }
  .foot {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 5px 10px 6px;
    border-top: 1px dashed color-mix(in srgb, var(--bg2) 80%, transparent);
    font-size: 10.5px;
    line-height: 1.4;
    color: var(--t1);
  }
  .foot p {
    margin: 0;
  }
  .keys {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  kbd {
    margin-left: 6px;
    padding: 0 4px;
    border-radius: 3px;
    border: 1px solid color-mix(in srgb, var(--bg2) 90%, transparent);
    font: inherit;
    color: var(--t2);
  }
  kbd:first-child {
    margin-left: 0;
  }
  @media (max-width: 720px), (pointer: coarse) {
    .keys {
      display: none;
    }
    .tab-btn,
    .clear {
      min-height: 32px;
      padding: 4px 14px;
      font-size: 12px;
    }
    .pick {
      min-height: 44px;
      justify-content: center;
    }
    .forget {
      flex-basis: 40px;
    }
  }
</style>
