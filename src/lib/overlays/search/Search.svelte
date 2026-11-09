<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { search, type Result, type ResultKind } from '../../core/search';
  import { tasks } from '../../core/tasks';
  import { openOverlay } from '../../core/ui';
  import { notes } from '../../widgets/notes/store';

  let open = false;
  let query = '';
  let sel = 0;
  let input: HTMLInputElement;
  let list: HTMLUListElement;
  let restore: HTMLElement | null = null;

  const off = openOverlay.subscribe((id) => {
    if (id !== 'search') return;
    openOverlay.set(null);
    if (open) close();
    else show();
  });
  onDestroy(off);

  async function show(prefill = '') {
    restore = document.activeElement as HTMLElement | null;
    query = prefill;
    sel = 0;
    open = true;
    await tick();
    input?.focus();
    input?.select();
  }

  function close(refocus = true) {
    open = false;
    if (refocus) restore?.focus?.({ preventScroll: true });
  }

  // Re-run when the query or the data changes while open.
  $: results = open && $tasks && $notes ? search(query) : [];
  $: if (sel >= results.length) sel = Math.max(0, results.length - 1);

  const KIND_LABEL: Record<ResultKind, string> = {
    task: 'task',
    note: 'note',
    command: 'command',
    widget: 'widget',
    game: 'game',
    theme: 'theme',
    station: 'radio',
    space: 'space',
    run: 'run',
  };

  function choose(r: Result | undefined) {
    if (!r) return;
    close(false);
    r.open();
  }

  async function move(delta: number) {
    if (!results.length) return;
    sel = (sel + delta + results.length) % results.length;
    await tick();
    list?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  function onInputKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) {
      e.preventDefault();
      void move(1);
    } else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) {
      e.preventDefault();
      void move(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[sel]);
    }
  }

  /** ⌘K / Ctrl+K (and Alt+K) open or close it from anywhere; Escape closes it. */
  function onWindowKey(e: KeyboardEvent) {
    const modK = (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.code === 'KeyK';
    const altK = e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.code === 'KeyK';
    if (modK || altK) {
      e.preventDefault();
      e.stopPropagation();
      if (open) close();
      else void show();
      return;
    }
    if (open && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }
</script>

<svelte:window on:keydown|capture={onWindowKey} />

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="backdrop" transition:fade={{ duration: 120 }} on:click|self={() => close()}>
    <div class="box" role="dialog" aria-modal="true" aria-label="Search" transition:fly={{ y: -8, duration: 140 }}>
      <div class="field">
        <span class="glyph" aria-hidden="true">⌕</span>
        <input
          bind:this={input}
          bind:value={query}
          on:input={() => (sel = 0)}
          on:keydown={onInputKey}
          placeholder="search tasks, notes, commands, themes…"
          aria-label="Search"
          aria-controls="search-results"
          aria-activedescendant={results.length ? `search-r${sel}` : undefined}
          spellcheck="false"
          autocomplete="off"
        />
        <kbd>esc</kbd>
      </div>
      <ul id="search-results" role="listbox" bind:this={list}>
        {#each results as r, i (r.key)}
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <li
            id="search-r{i}"
            data-i={i}
            role="option"
            aria-selected={i === sel}
            class:sel={i === sel}
            class:dim={r.dim}
            on:click={() => choose(r)}
            on:mousemove={() => (sel = i)}
          >
            <span class="kind k-{r.kind}">{KIND_LABEL[r.kind]}</span>
            <span class="main">
              <span class="title">{r.title}</span>
              {#if r.detail}<span class="detail">{r.detail}</span>{/if}
            </span>
            {#if r.meta}<span class="meta">{r.meta}</span>{/if}
          </li>
        {:else}
          <li class="none" role="presentation">nothing matches “{query}”</li>
        {/each}
      </ul>
      <footer>
        <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
        <span><kbd>↵</kbd> open</span>
        <span><code>#</code> tasks</span>
        <span><code>/</code> notes</span>
        <span><code>&gt;</code> commands</span>
      </footer>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 160;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: min(14vh, 120px) 12px 12px;
    background: color-mix(in srgb, var(--bg1) 55%, transparent);
    backdrop-filter: blur(2px);
  }
  .box {
    width: min(640px, 100%);
    max-height: min(70vh, 560px);
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
  .field {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-bottom: 1px solid color-mix(in srgb, var(--bg2) 80%, transparent);
  }
  .glyph {
    color: var(--hl1);
    font-size: 16px;
  }
  input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: 0;
    outline: none;
    color: var(--t2);
    font: inherit;
    font-size: 15px;
  }
  ul {
    margin: 0;
    padding: 6px;
    list-style: none;
    overflow: auto;
  }
  li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    border-radius: 7px;
    cursor: pointer;
  }
  li.sel {
    background: color-mix(in srgb, var(--hl1) 14%, transparent);
  }
  li.sel .title {
    color: var(--hl1);
  }
  li.dim .title {
    opacity: 0.55;
    text-decoration: line-through;
  }
  .kind {
    flex: 0 0 62px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--t1);
  }
  .k-task,
  .k-run {
    color: var(--hl1);
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .title,
  .detail {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .detail {
    color: var(--t1);
    font-size: 11px;
  }
  .meta {
    flex: 0 0 auto;
    max-width: 30%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--t1);
    font-size: 11px;
  }
  .none {
    color: var(--t1);
    cursor: default;
  }
  footer {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    padding: 7px 14px;
    border-top: 1px dashed color-mix(in srgb, var(--bg2) 80%, transparent);
    color: var(--t1);
    font-size: 11px;
  }
  kbd {
    min-width: 18px;
    margin-right: 2px;
    padding: 0 5px;
    border: 1px solid var(--bg2);
    border-bottom-width: 2px;
    border-radius: 4px;
    font: inherit;
    font-size: 10px;
    text-align: center;
  }
  code {
    color: var(--hl1);
  }
  @media (max-width: 520px) {
    .kind {
      flex-basis: 44px;
    }
    footer span:nth-child(n + 3) {
      display: none;
    }
  }
</style>
