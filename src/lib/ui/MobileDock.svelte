<script lang="ts">
  import { tick } from 'svelte';
  import { getWidget } from '../core/registry';
  import { openOverlay } from '../core/ui';
  import { focusPane, leaves, workspace } from '../core/workspace';
  import MobileMenu from './MobileMenu.svelte';

  /**
   * The phone's pane bar: one chip per pane (tap to jump there; the strip
   * above also swipes), search, and + for the menu that opens widgets and
   * holds the actions that are keyboard shortcuts on a computer.
   */

  let menuOpen = false;
  let strip: HTMLDivElement;

  $: panes = leaves($workspace.root);
  $: focused = $workspace.focused;

  // keep the current pane's chip in view
  $: if (strip && focused) {
    void tick().then(() => strip?.querySelector('[aria-current="true"]')?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' }));
  }

  function title(widget: string, config: Record<string, unknown>): string {
    const def = getWidget(widget);
    return (def?.paneTitle?.(config) ?? def?.title ?? widget).replace(/^Arcade · /, '');
  }
</script>

<nav class="dock" aria-label="Panes">
  <div class="chips" bind:this={strip}>
    {#each panes as p, i (p.id)}
      <button class="chip" class:on={p.id === focused} aria-current={p.id === focused} on:click={() => focusPane(p.id)} aria-label="Pane {i + 1}: {title(p.widget, p.config)}">
        <span class="icon" aria-hidden="true">{getWidget(p.widget)?.icon ?? '?'}</span>
        <span class="name">{title(p.widget, p.config)}</span>
      </button>
    {/each}
  </div>
  <button class="act" on:click={() => openOverlay.set('search')} aria-label="Search" title="Search">
    <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.2" /><path d="M10.2 10.2 14 14" /></svg>
  </button>
  <button class="act plus" on:click={() => (menuOpen = true)} aria-label="Open a widget, and more" aria-haspopup="dialog" aria-expanded={menuOpen} title="Open a widget, and more">
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
  </button>
</nav>

<MobileMenu bind:open={menuOpen} />

<style>
  .dock {
    display: flex;
    align-items: stretch;
    gap: 4px;
    flex: 0 0 44px;
    height: 44px;
    padding: 4px 6px;
    border-top: 1px solid color-mix(in srgb, var(--bg2) 80%, transparent);
    background: color-mix(in srgb, var(--bg2) 22%, var(--bg1));
    user-select: none;
  }
  /* While typing (the on-screen keyboard is up, see core/device.ts), the dock steps aside for the pane. */
  :global(html.typing) .dock {
    display: none;
  }
  .chips {
    flex: 1;
    min-width: 0;
    display: flex;
    gap: 4px;
    overflow-x: auto;
    scrollbar-width: none;
    overscroll-behavior-x: contain;
  }
  .chips::-webkit-scrollbar {
    display: none;
  }
  .chip {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 150px;
    padding: 0 12px;
    border: 1px solid var(--bg2);
    border-radius: 999px;
    color: var(--t1);
    font-size: 13px;
    white-space: nowrap;
  }
  .chip.on {
    border-color: var(--hl1);
    color: var(--hl1);
    background: color-mix(in srgb, var(--hl1) 14%, transparent);
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .icon {
    font-size: 12px;
  }
  .act {
    flex: 0 0 40px;
    display: grid;
    place-items: center;
    border: 1px solid var(--bg2);
    border-radius: 10px;
    color: var(--t2);
  }
  .act.plus {
    border-color: var(--hl1);
    background: var(--hl1);
    color: var(--bg1);
  }
  .act svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
  }
</style>
