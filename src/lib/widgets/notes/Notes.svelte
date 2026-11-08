<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import type { Config } from '../../core/types';
  import { renderMarkdown, toggleTask } from './markdown';
  import { createNote, deleteNote, notes, sortNotes, timeAgo, titleOf, togglePin, updateNote } from './store';

  export let paneId: string;
  export let focused = false;
  export let config: Config = {};
  export let updateConfig: (patch: Config) => void = () => {};

  type Mode = 'edit' | 'split' | 'preview';
  const MODES: Mode[] = ['edit', 'split', 'preview'];

  let width = 0;
  let textarea: HTMLTextAreaElement;
  let fileInput: HTMLInputElement;
  let search = '';
  let sidebarOpen: boolean | null = null; // null = automatic from width
  let confirmDelete = false;
  let confirmTimer: ReturnType<typeof setTimeout> | undefined;

  $: sorted = sortNotes($notes);
  $: current = $notes.find((n) => n.id === config.noteId) ?? sorted[0];
  $: narrow = width > 0 && width < 560;
  $: showSidebar = sidebarOpen ?? (!narrow && width > 0);
  $: mode = ((config.mode as Mode) || (width >= 820 ? 'split' : 'edit')) as Mode;
  $: filtered = search.trim()
    ? sorted.filter((n) => n.body.toLowerCase().includes(search.trim().toLowerCase()))
    : sorted;

  // Local draft so typing is instant; saved to the store with a debounce.
  let draft = '';
  let loadedId: string | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let saved = true;
  $: if (current && current.id !== loadedId) {
    flush();
    loadedId = current.id;
    draft = current.body;
    saved = true;
  }
  $: html = mode === 'edit' ? '' : renderMarkdown(draft);
  $: words = draft.trim() ? draft.trim().split(/\s+/).length : 0;

  function flush() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = undefined;
    if (loadedId && !saved) updateNote(loadedId, draft);
    saved = true;
  }

  function onEdit() {
    saved = false;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 400);
  }

  function open(id: string) {
    flush();
    updateConfig({ noteId: id });
    if (narrow) sidebarOpen = false;
    tick().then(() => textarea?.focus());
  }

  function newNote() {
    const n = createNote('# ');
    open(n.id);
    tick().then(() => textarea?.setSelectionRange(2, 2));
  }

  function remove() {
    if (!current) return;
    if (!confirmDelete) {
      confirmDelete = true;
      confirmTimer = setTimeout(() => (confirmDelete = false), 3000);
      return;
    }
    confirmDelete = false;
    const id = current.id;
    loadedId = null;
    deleteNote(id);
    updateConfig({ noteId: null });
  }

  function setMode(m: Mode) {
    updateConfig({ mode: m });
  }

  /* --------------------------------------------------------- editing */

  async function replaceSelection(fn: (sel: string) => string, offsetStart: number, offsetEnd: number) {
    const { selectionStart: a, selectionEnd: b } = textarea;
    const sel = draft.slice(a, b);
    draft = draft.slice(0, a) + fn(sel) + draft.slice(b);
    onEdit();
    await tick();
    textarea.setSelectionRange(a + offsetStart, b + offsetEnd);
  }

  function onKeyDown(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Tab' && !mod && !e.altKey) {
      e.preventDefault();
      replaceSelection(() => '  ', 2, 2 - (textarea.selectionEnd - textarea.selectionStart));
    } else if (mod && !e.altKey && (e.key === 'b' || e.key === 'i')) {
      e.preventDefault();
      const mark = e.key === 'b' ? '**' : '_';
      replaceSelection((s) => mark + s + mark, mark.length, mark.length);
    } else if (mod && e.key === 's') {
      e.preventDefault();
      flush();
    }
  }

  function onPreviewClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target instanceof HTMLInputElement && target.type === 'checkbox') {
      e.preventDefault();
      const boxes = Array.from((e.currentTarget as HTMLElement).querySelectorAll('input[type="checkbox"]'));
      draft = toggleTask(draft, boxes.indexOf(target));
      onEdit();
    }
  }

  /* ------------------------------------------------------ import/export */

  function exportNote() {
    if (!current) return;
    flush();
    const name =
      titleOf(current)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'note';
    const url = URL.createObjectURL(new Blob([draft], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importFile() {
    const file = fileInput.files?.[0];
    if (!file) return;
    const text = await file.text();
    const n = createNote(text.slice(0, 200_000));
    fileInput.value = '';
    open(n.id);
  }

  /* ------------------------------------------------------------- focus */

  let wasFocused = false;
  $: {
    if (focused && !wasFocused) tick().then(() => textarea?.focus({ preventScroll: true }));
    wasFocused = focused;
  }

  onDestroy(() => {
    flush();
    if (confirmTimer) clearTimeout(confirmTimer);
  });
</script>

<div class="notes" bind:clientWidth={width} data-pane={paneId}>
  {#if showSidebar}
    <aside class="side" class:overlay={narrow}>
      <div class="side-head">
        <input class="search" placeholder="search notes" bind:value={search} aria-label="Search notes" spellcheck="false" />
        <button class="icon-btn" title="New note" aria-label="New note" on:click={newNote}>+</button>
      </div>
      <ul class="list">
        {#each filtered as n (n.id)}
          <li>
            <button class="item" class:active={current?.id === n.id} on:click={() => open(n.id)}>
              <span class="t">{#if n.pinned}<span class="pin">*</span>{/if}{titleOf(n)}</span>
              <span class="m">{timeAgo(n.updatedAt)}</span>
            </button>
          </li>
        {/each}
        {#if filtered.length === 0}<li class="empty">{search ? 'no matches' : 'no notes yet'}</li>{/if}
      </ul>
      <div class="side-foot">
        <button on:click={() => fileInput.click()}>import .md</button>
        <span>{$notes.length} {$notes.length === 1 ? 'note' : 'notes'}</span>
      </div>
    </aside>
  {/if}

  <section class="main">
    <div class="bar">
      <button class="icon-btn" title="Toggle note list" aria-label="Toggle note list" on:click={() => (sidebarOpen = !showSidebar)}>
        <svg viewBox="0 0 16 16"><line x1="2.5" y1="4" x2="13.5" y2="4" /><line x1="2.5" y1="8" x2="13.5" y2="8" /><line x1="2.5" y1="12" x2="13.5" y2="12" /></svg>
      </button>
      <span class="title">{titleOf(current)}</span>
      <div class="modes" role="group" aria-label="View mode">
        {#each MODES as m}
          <button class:on={mode === m} on:click={() => setMode(m)}>{m}</button>
        {/each}
      </div>
      {#if current}
        <button class="txt" title="Pin to the top" on:click={() => togglePin(current.id)}>{current.pinned ? 'unpin' : 'pin'}</button>
        <button class="txt" title="Download as .md" on:click={exportNote}>export</button>
        <button class="txt danger" class:armed={confirmDelete} on:click={remove}>{confirmDelete ? 'confirm?' : 'delete'}</button>
      {/if}
    </div>

    {#if current}
      <div class="panes mode-{mode}">
        {#if mode !== 'preview'}
          <textarea
            bind:this={textarea}
            bind:value={draft}
            on:input={onEdit}
            on:keydown={onKeyDown}
            on:blur={flush}
            spellcheck="false"
            placeholder="# Title&#10;&#10;Write markdown here..."
            aria-label="Note editor"
          />
        {/if}
        {#if mode !== 'edit'}
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
          <article class="md" on:click={onPreviewClick}>{@html html}</article>
        {/if}
      </div>
      <div class="foot">
        <span>{words} words · {Math.max(1, Math.round(words / 220))} min read</span>
        <span class="state" class:dirty={!saved}>{saved ? 'saved' : 'saving...'}</span>
      </div>
    {:else}
      <div class="blank">
        <p>No notes yet.</p>
        <button class="txt" on:click={newNote}>create one</button>
      </div>
    {/if}
  </section>

  <input class="hidden" type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" bind:this={fileInput} on:change={importFile} />
</div>

<style>
  .notes {
    position: relative;
    display: flex;
    height: 100%;
    color: var(--t2);
    font-size: 13px;
  }
  .side {
    display: flex;
    flex-direction: column;
    width: 220px;
    flex: 0 0 220px;
    border-right: 1px solid color-mix(in srgb, var(--bg2) 80%, transparent);
    background: color-mix(in srgb, var(--bg2) 14%, var(--bg1));
    min-height: 0;
  }
  .side.overlay {
    position: absolute;
    inset: 0 auto 0 0;
    z-index: 5;
    width: min(260px, 85%);
    box-shadow: 12px 0 30px -12px rgba(0, 0, 0, 0.6);
  }
  .side-head {
    display: flex;
    gap: 4px;
    padding: 8px;
  }
  .search {
    flex: 1;
    min-width: 0;
    padding: 4px 8px;
    border-radius: 6px;
    border: 1px solid var(--bg2);
    background: var(--bg1);
    color: var(--t2);
    font: inherit;
    font-size: 12px;
    outline: none;
  }
  .search:focus {
    border-color: var(--hl1);
  }
  .list {
    flex: 1;
    overflow: auto;
    margin: 0;
    padding: 0 6px 6px;
    list-style: none;
  }
  .item {
    display: flex;
    flex-direction: column;
    width: 100%;
    text-align: left;
    padding: 6px 8px;
    border-radius: 6px;
    color: var(--t2);
  }
  .item:hover {
    background: color-mix(in srgb, var(--bg2) 50%, transparent);
  }
  .item.active {
    background: color-mix(in srgb, var(--hl1) 18%, transparent);
  }
  .item .t {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .item.active .t {
    color: var(--hl1);
  }
  .pin {
    color: var(--hl1);
    margin-right: 4px;
  }
  .item .m,
  .empty {
    font-size: 11px;
    color: var(--t1);
  }
  .empty {
    padding: 8px;
  }
  .side-foot {
    display: flex;
    justify-content: space-between;
    padding: 6px 10px;
    font-size: 11px;
    color: var(--t1);
    border-top: 1px dashed var(--bg2);
  }
  .side-foot button:hover {
    color: var(--hl1);
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-bottom: 1px dashed color-mix(in srgb, var(--bg2) 80%, transparent);
    white-space: nowrap;
  }
  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--hl1);
    font-weight: 600;
  }
  .icon-btn {
    width: 24px;
    height: 24px;
    flex: 0 0 24px;
    display: grid;
    place-items: center;
    border-radius: 5px;
    border: 1px solid var(--bg2);
    color: var(--t1);
    font-size: 15px;
    line-height: 1;
  }
  .icon-btn:hover {
    color: var(--hl1);
    border-color: var(--hl1);
  }
  svg {
    width: 13px;
    height: 13px;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
  }
  .modes {
    display: flex;
    border: 1px solid var(--bg2);
    border-radius: 6px;
    overflow: hidden;
  }
  .modes button {
    padding: 1px 8px;
    font-size: 11px;
    color: var(--t1);
  }
  .modes button.on {
    background: var(--hl1);
    color: var(--bg1);
  }
  .txt {
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 4px;
    color: var(--t1);
  }
  .txt:hover {
    color: var(--hl1);
  }
  .danger.armed {
    color: #fff;
    background: #e5484d;
  }
  .panes {
    flex: 1;
    min-height: 0;
    display: grid;
  }
  .panes.mode-split {
    grid-template-columns: 1fr 1fr;
  }
  textarea {
    width: 100%;
    height: 100%;
    resize: none;
    padding: 12px 14px;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--t2);
    font: inherit;
    font-size: 13px;
    line-height: 1.6;
    tab-size: 2;
  }
  textarea::placeholder {
    color: var(--t1);
    opacity: 0.6;
  }
  .mode-split textarea {
    border-right: 1px dashed color-mix(in srgb, var(--bg2) 80%, transparent);
  }
  .md {
    overflow: auto;
    padding: 12px 16px 24px;
    line-height: 1.65;
    min-width: 0;
  }
  .foot {
    display: flex;
    justify-content: space-between;
    padding: 3px 10px;
    font-size: 11px;
    color: var(--t1);
    border-top: 1px dashed color-mix(in srgb, var(--bg2) 80%, transparent);
  }
  .state.dirty {
    color: var(--hl1);
  }
  .blank {
    flex: 1;
    display: grid;
    place-content: center;
    gap: 8px;
    text-align: center;
    color: var(--t1);
  }
  .hidden {
    display: none;
  }

  /* rendered markdown */
  .md :global(h1),
  .md :global(h2),
  .md :global(h3) {
    color: var(--hl1);
    line-height: 1.3;
    margin: 1em 0 0.45em;
  }
  .md :global(h1) {
    font-size: 1.55em;
    margin-top: 0.2em;
  }
  .md :global(h2) {
    font-size: 1.25em;
    border-bottom: 1px dashed var(--bg2);
    padding-bottom: 0.2em;
  }
  .md :global(h3) {
    font-size: 1.08em;
  }
  .md :global(p),
  .md :global(ul),
  .md :global(ol),
  .md :global(pre),
  .md :global(blockquote),
  .md :global(table) {
    margin: 0 0 0.8em;
  }
  .md :global(ul),
  .md :global(ol) {
    padding-left: 1.4em;
  }
  .md :global(ul) {
    list-style: disc;
  }
  .md :global(ol) {
    list-style: decimal;
  }
  .md :global(li.task) {
    list-style: none;
    margin-left: -1.2em;
  }
  .md :global(input[type='checkbox']) {
    accent-color: var(--hl1);
    margin-right: 6px;
    cursor: pointer;
    vertical-align: -1px;
  }
  .md :global(a) {
    color: var(--hl1);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .md :global(code) {
    padding: 0.1em 0.35em;
    border-radius: 4px;
    background: color-mix(in srgb, var(--bg2) 45%, transparent);
    font-size: 0.92em;
  }
  .md :global(pre) {
    padding: 10px 12px;
    border-radius: 8px;
    overflow: auto;
    background: color-mix(in srgb, var(--bg2) 30%, var(--bg1));
    border: 1px solid color-mix(in srgb, var(--bg2) 70%, transparent);
  }
  .md :global(pre code) {
    padding: 0;
    background: none;
  }
  .md :global(blockquote) {
    padding: 2px 12px;
    border-left: 3px solid var(--hl1);
    color: var(--t1);
  }
  .md :global(table) {
    border-collapse: collapse;
    display: block;
    overflow: auto;
  }
  .md :global(th),
  .md :global(td) {
    padding: 4px 10px;
    border: 1px solid var(--bg2);
    text-align: left;
  }
  .md :global(th) {
    background: color-mix(in srgb, var(--bg2) 35%, transparent);
  }
  .md :global(hr) {
    border: 0;
    border-top: 1px dashed var(--bg2);
    margin: 1.2em 0;
  }
  .md :global(img) {
    max-width: 100%;
    border-radius: 6px;
  }
  .md :global(strong) {
    color: var(--t2);
    font-weight: 700;
  }

  @media (max-width: 720px) {
    .panes.mode-split {
      grid-template-columns: 1fr;
      grid-template-rows: 1fr 1fr;
    }
  }
</style>
