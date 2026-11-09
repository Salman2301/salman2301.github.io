<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { comboText, keyLabel, SHORTCUTS } from '../../core/keys';
  import { openOverlay } from '../../core/ui';

  let open = false;
  let query = '';
  let input: HTMLInputElement;
  let restore: HTMLElement | null = null;

  // openOverlay.set('keys') toggles the sheet (Alt+/ again closes it).
  const off = openOverlay.subscribe((id) => {
    if (id !== 'keys') return;
    openOverlay.set(null);
    if (open) close();
    else show();
  });
  onDestroy(off);

  async function show() {
    restore = document.activeElement as HTMLElement | null;
    query = '';
    open = true;
    await tick();
    input?.focus();
  }

  function close() {
    open = false;
    restore?.focus?.({ preventScroll: true });
  }

  $: q = query.trim().toLowerCase();
  $: groups = SHORTCUTS.map((g) => ({
    ...g,
    items: q
      ? g.items.filter(
          (i) =>
            g.title.toLowerCase().includes(q) ||
            i.does.toLowerCase().includes(q) ||
            i.keys.some((c) => comboText(c).toLowerCase().includes(q)),
        )
      : g.items,
  })).filter((g) => g.items.length);

  function onKey(e: KeyboardEvent) {
    if (open && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }
</script>

<svelte:window on:keydown|capture={onKey} />

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="backdrop" transition:fade={{ duration: 140 }} on:click|self={close}>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" transition:scale={{ start: 0.96, duration: 160 }}>
      <header>
        <h2>Keyboard shortcuts</h2>
        <input bind:this={input} bind:value={query} placeholder="filter: theme, tab, @, calendar…" aria-label="Filter shortcuts" spellcheck="false" />
        <button class="x" on:click={close} aria-label="Close" title="Close (Esc)">×</button>
      </header>
      <div class="body">
        {#each groups as g (g.title)}
          <section>
            <h3>{g.title}{#if g.where}<span class="where">{g.where}</span>{/if}</h3>
            <dl>
              {#each g.items as item (item.does)}
                <dt>
                  {#each item.keys as combo, ci}
                    {#if ci}<span class="or">or</span>{/if}
                    <span class="combo">{#each combo as k}<kbd>{keyLabel(k)}</kbd>{/each}</span>
                  {/each}
                </dt>
                <dd>{item.does}</dd>
              {/each}
            </dl>
          </section>
        {:else}
          <p class="none">no shortcut matches “{query}”</p>
        {/each}
      </div>
      <footer>Alt is ⌥ Option on a Mac · the terminal command <code>keys</code> opens this too</footer>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 150;
    display: grid;
    place-items: center;
    padding: 16px;
    background: color-mix(in srgb, var(--bg1) 60%, transparent);
    backdrop-filter: blur(2px);
  }
  .sheet {
    width: min(860px, 100%);
    max-height: min(86vh, 760px);
    display: flex;
    flex-direction: column;
    border: 1px solid var(--bg2);
    border-radius: 12px;
    background: var(--bg1);
    color: var(--t2);
    font-size: 13px;
    box-shadow: 0 24px 60px -20px color-mix(in srgb, var(--bg2) 80%, transparent);
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-bottom: 1px solid color-mix(in srgb, var(--bg2) 80%, transparent);
  }
  h2 {
    margin: 0;
    font-size: 15px;
    white-space: nowrap;
  }
  header input {
    flex: 1;
    min-width: 0;
    padding: 5px 10px;
    border: 1px solid var(--bg2);
    border-radius: 6px;
    background: transparent;
    color: var(--t2);
    font: inherit;
    outline: none;
  }
  header input:focus {
    border-color: var(--hl1);
  }
  .x {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    color: var(--t1);
    font-size: 18px;
  }
  .x:hover {
    color: var(--hl1);
  }
  .body {
    overflow: auto;
    padding: 6px 14px 14px;
    columns: 2 340px;
    column-gap: 28px;
  }
  section {
    break-inside: avoid;
    padding-top: 10px;
  }
  h3 {
    margin: 0 0 6px;
    color: var(--hl1);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .where {
    margin-left: 8px;
    color: var(--t1);
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 5px 14px;
    margin: 0;
    align-items: baseline;
  }
  dt {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }
  dd {
    margin: 0;
    color: var(--t2);
  }
  .combo {
    display: inline-flex;
    gap: 3px;
  }
  kbd {
    min-width: 20px;
    padding: 1px 6px;
    border: 1px solid var(--bg2);
    border-bottom-width: 2px;
    border-radius: 5px;
    background: color-mix(in srgb, var(--bg2) 25%, var(--bg1));
    color: var(--t2);
    font: inherit;
    font-size: 11px;
    text-align: center;
  }
  .or {
    color: var(--t1);
    font-size: 10px;
  }
  .none {
    color: var(--t1);
    padding: 12px 0;
  }
  footer {
    padding: 8px 14px;
    border-top: 1px dashed color-mix(in srgb, var(--bg2) 80%, transparent);
    color: var(--t1);
    font-size: 11px;
  }
  code {
    color: var(--hl1);
  }
</style>
