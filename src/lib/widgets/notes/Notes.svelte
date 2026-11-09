<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import type { Config } from '../../core/types';
  import { renderMarkdown, toggleTask } from './markdown';
  import { createNote, deleteNote, notes, sortNotes, timeAgo, titleOf, togglePin, updateNote } from './store';
  import DatePicker from '../../ui/DatePicker.svelte';
  import { mention } from '../../ui/mention';
  import { dateToken, openMention, resolveForHtml, type MentionKind } from '../../core/mentions';
  import { friendlyDate, parseDate, relativeDay } from '../../core/dates';
  import { projectOf, projects, setActiveTask, tasks, toggleTask as toggleTaskDone } from '../../core/tasks';

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
  $: html = mode === 'edit' ? '' : renderMarkdown(resolveForHtml(draft, $notes, $tasks));
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

  /**
   * Enter on a list line starts the next item with the same syntax: "- ",
   * "2. " (counted up) or "- [ ] " for task lines. Enter on an empty item
   * ends the list instead. Returns true when it handled the key.
   */
  const LIST_LINE = /^(\s*)([-*+]|\d+[.)])(\s+)(\[[ xX]\]\s+)?(.*)$/;
  async function continueList(e: KeyboardEvent): Promise<boolean> {
    const pos = textarea.selectionStart;
    if (pos !== textarea.selectionEnd) return false;
    const lineStart = draft.lastIndexOf('\n', pos - 1) + 1;
    const m = LIST_LINE.exec(draft.slice(lineStart, pos));
    if (!m) return false;
    const [, indent, marker, gap, box, rest] = m;
    e.preventDefault();
    if (!rest.trim()) {
      // empty item: drop the marker and leave the list
      draft = draft.slice(0, lineStart) + draft.slice(pos);
      onEdit();
      await tick();
      textarea.setSelectionRange(lineStart, lineStart);
      return true;
    }
    const num = /^(\d+)([.)])$/.exec(marker);
    const next = num ? `${Number(num[1]) + 1}${num[2]}` : marker;
    const insert = `\n${indent}${next}${gap}${box ? '[ ] ' : ''}`;
    await replaceSelection(() => insert, insert.length, insert.length);
    return true;
  }

  /* -------------------------------------------------------- date / time */

  let pickerOpen = false;
  let pickerTime = false;

  /** Insert text at the caret, replacing any selection. */
  async function insertAtCaret(text: string) {
    const len = text.length;
    const span = textarea.selectionEnd - textarea.selectionStart;
    await replaceSelection(() => text, len, len - span);
  }

  /** The date picker writes [@date: 2026-11-28] or [@time: 2026-11-28 15:20]. */
  function pickDate(e: CustomEvent<string>) {
    pickerOpen = false;
    if (e.detail) insertAtCaret(`${dateToken(e.detail)} `);
    textarea?.focus();
  }

  /** Opened from the @ list: "pick a date…" / "pick date and time…". */
  function openPicker(withTime: boolean) {
    pickerTime = withTime;
    pickerOpen = true;
  }

  // In a note, @ offers tasks and dates, and can open the date picker.
  const mentionOpts = { target: 'task' as const, onAction: (a: 'pick-date' | 'pick-time') => openPicker(a === 'pick-time') };

  /* ------------------------------------------ chips in the preview */

  // Hovering a chip shows a card with details and actions; right-click (or
  // Shift+F10 / the menu key on a focused chip) pins it open.
  interface Card {
    kind: MentionKind;
    id: string;
    ref: string;
    x: number;
    y: number;
    up: boolean;
    pinned: boolean;
  }
  let card: Card | null = null;
  let cardEl: HTMLDivElement;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  const chipOf = (e: Event) => (e.target as HTMLElement | null)?.closest?.<HTMLElement>('.mention[data-kind]') ?? null;

  function cardFor(chip: HTMLElement, pinned: boolean): Card {
    const r = chip.getBoundingClientRect();
    const up = r.bottom + 190 > window.innerHeight;
    return {
      kind: chip.dataset.kind as MentionKind,
      id: chip.dataset.id ?? '',
      ref: chip.dataset.ref ?? '',
      x: Math.max(8, Math.min(r.left, window.innerWidth - 288)),
      y: up ? r.top - 6 : r.bottom + 6,
      up,
      pinned,
    };
  }

  function scheduleHide() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (card && !card.pinned) card = null;
    }, 220);
  }

  function onPreviewOver(e: MouseEvent) {
    const chip = chipOf(e);
    if (!chip) return;
    if (hideTimer) clearTimeout(hideTimer);
    if (card?.pinned) return;
    if (showTimer) clearTimeout(showTimer);
    showTimer = setTimeout(() => (card = cardFor(chip, false)), 260);
  }

  function onPreviewOut(e: MouseEvent) {
    if (!chipOf(e)) return;
    if (showTimer) clearTimeout(showTimer);
    if (card && !card.pinned) scheduleHide();
  }

  function onPreviewMenu(e: MouseEvent) {
    const chip = chipOf(e);
    if (!chip) return;
    e.preventDefault();
    if (showTimer) clearTimeout(showTimer);
    card = cardFor(chip, true);
  }

  function onPreviewKey(e: KeyboardEvent) {
    const chip = chipOf(e);
    if (!chip) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      openMention(chip.dataset.kind as MentionKind, chip.dataset.id ?? '');
    } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      card = cardFor(chip, true);
      tick().then(() => cardEl?.querySelector<HTMLElement>('button')?.focus());
    }
  }

  // Keyboard: focusing a chip shows its card too; Tab moves on into the card.
  function onPreviewFocus(e: FocusEvent) {
    const chip = chipOf(e);
    if (!chip || card?.pinned) return;
    if (hideTimer) clearTimeout(hideTimer);
    card = cardFor(chip, false);
  }

  function onPreviewBlur(e: FocusEvent) {
    if (!chipOf(e) || !card || card.pinned) return;
    if (cardEl?.contains(e.relatedTarget as Node)) return;
    scheduleHide();
  }

  function onCardFocusOut(e: FocusEvent) {
    if (card && !card.pinned && !cardEl?.contains(e.relatedTarget as Node)) scheduleHide();
  }

  function onWindowDown(e: PointerEvent) {
    if (card?.pinned && !cardEl?.contains(e.target as Node)) card = null;
  }

  function onWindowKey(e: KeyboardEvent) {
    if (card && e.key === 'Escape') card = null;
  }

  $: cardTask = card?.kind === 'task' ? $tasks.find((t) => t.id === card?.id) ?? null : null;
  $: cardNote = card?.kind === 'note' ? $notes.find((n) => n.id === card?.id) ?? null : null;
  $: cardProject = cardTask ? $projects.find((p) => p.id === projectOf(cardTask!))?.name ?? 'Inbox' : '';

  function longDate(value: string): string {
    const d = parseDate(value);
    if (!d) return value;
    const day = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return value.length > 10 ? `${day} · ${value.slice(11)}` : day;
  }

  function cardOpen() {
    if (!card) return;
    openMention(card.kind, card.id);
    card = null;
  }

  function cardToggle() {
    if (cardTask) toggleTaskDone(cardTask.id);
  }

  function cardFocus() {
    if (!cardTask) return;
    setActiveTask(cardTask.id);
    card = null;
  }

  async function cardCopy() {
    if (!card) return;
    try {
      await navigator.clipboard.writeText(card.kind === 'date' ? `[@${card.id.length > 10 ? 'time' : 'date'}: ${card.id}]` : card.ref);
    } catch {
      /* clipboard blocked */
    }
    card = null;
  }


  /* ----------------------------------------------- split scroll sync */

  let preview: HTMLElement;
  // which pane the user is scrolling, so the other one does not echo it back
  let scrollingFrom: 'edit' | 'preview' | null = null;
  let scrollRelease = 0;

  function syncScroll(from: 'edit' | 'preview') {
    if (mode !== 'split' || scrollingFrom === (from === 'edit' ? 'preview' : 'edit')) return;
    const src = from === 'edit' ? textarea : preview;
    const dst = from === 'edit' ? preview : textarea;
    if (!src || !dst) return;
    scrollingFrom = from;
    const room = src.scrollHeight - src.clientHeight;
    const ratio = room > 0 ? src.scrollTop / room : 0;
    dst.scrollTop = ratio * (dst.scrollHeight - dst.clientHeight);
    cancelAnimationFrame(scrollRelease);
    scrollRelease = requestAnimationFrame(() => (scrollingFrom = null));
  }

  function onKeyDown(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Enter' && !mod && !e.shiftKey && !e.altKey) {
      continueList(e);
      return;
    }
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
    const link = target.closest<HTMLElement>('[data-kind][data-id]');
    if (link) {
      e.preventDefault();
      openMention(link.dataset.kind as MentionKind, link.dataset.id ?? '');
      return;
    }
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

<svelte:window on:pointerdown|capture={onWindowDown} on:keydown={onWindowKey} />

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
        {#if pickerOpen && mode !== 'preview'}
          <div class="date-pop at-editor">
            <DatePicker withTime={pickerTime} on:pick={pickDate} on:close={() => (pickerOpen = false)} />
          </div>
        {/if}
        {#if mode !== 'preview'}
          <textarea
            bind:this={textarea}
            use:mention={mentionOpts}
            bind:value={draft}
            on:input={onEdit}
            on:keydown={onKeyDown}
            on:scroll={() => syncScroll('edit')}
            on:blur={flush}
            spellcheck="false"
            placeholder="# Title&#10;&#10;Write markdown here. Type @ for a task, @time, @date or @tmrw."
            aria-label="Note editor"
          />
        {/if}
        {#if mode !== 'edit'}
          <!-- Chips are focusable; focusin/focusout below give keyboard users the same card as hover. -->
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions a11y-mouse-events-have-key-events -->
          <article
            class="md"
            bind:this={preview}
            on:scroll={() => {
              syncScroll('preview');
              if (card) card = null;
            }}
            on:click={onPreviewClick}
            on:mouseover={onPreviewOver}
            on:mouseout={onPreviewOut}
            on:focusin={onPreviewFocus}
            on:focusout={onPreviewBlur}
            on:contextmenu={onPreviewMenu}
            on:keydown={onPreviewKey}
          >
            {@html html}
          </article>
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

{#if card}
    <div
      class="mcard"
      class:up={card.up}
      bind:this={cardEl}
      style="left:{card.x}px;top:{card.y}px"
      role="dialog"
      aria-label="Link details"
      on:mouseenter={() => hideTimer && clearTimeout(hideTimer)}
      on:mouseleave={() => card && !card.pinned && scheduleHide()}
      on:focusin={() => hideTimer && clearTimeout(hideTimer)}
      on:focusout={onCardFocusOut}
    >
      {#if card.kind === 'task'}
        {#if cardTask}
          <div class="mc-head">
            <span class="state" class:done={cardTask.done} aria-hidden="true" />
            <span class:struck={cardTask.done}><b>#{cardTask.no}</b> {cardTask.text}</span>
          </div>
          <div class="mc-meta">
            <span class="badge" class:done={cardTask.done}>{cardTask.done ? 'completed' : 'active'}</span>
            {cardProject}{#if cardTask.due} · due {friendlyDate(cardTask.due)}{/if}
          </div>
          <div class="mc-actions">
            <button on:click={cardOpen}>open task</button>
            <button on:click={cardToggle}>{cardTask.done ? 'mark active' : 'mark done'}</button>
            {#if !cardTask.done}<button on:click={cardFocus}>focus</button>{/if}
          </div>
        {:else}
          <div class="mc-head">task {card.ref} no longer exists</div>
        {/if}
      {:else if card.kind === 'date'}
        {#if card.id}
          <div class="mc-head">{longDate(card.id)}</div>
          <div class="mc-meta"><span class="badge">{relativeDay(card.id)}</span> reminder, shown in the calendar</div>
          <div class="mc-actions">
            <button on:click={cardOpen}>open in calendar</button>
            <button on:click={cardCopy}>copy</button>
          </div>
        {:else}
          <div class="mc-head">"{card.ref}" is not a date</div>
          <div class="mc-meta">use [@date: 2026-11-28] or [@time: 2026-11-28 15:20]</div>
        {/if}
      {:else if cardNote}
        <div class="mc-head">{titleOf(cardNote)}</div>
        <div class="mc-actions"><button on:click={cardOpen}>open note</button></div>
      {:else}
        <div class="mc-head">note "{card.ref}" not found</div>
      {/if}
    </div>
  {/if}
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
  .date-pop {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 60;
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
    /* Let the toolbar wrap instead of clipping pin / export / delete off the edge. */
    .bar {
      flex-wrap: wrap;
      white-space: normal;
      row-gap: 6px;
    }
    .title {
      flex: 1 1 0;
    }
    .bar .txt {
      min-height: 28px;
      padding: 0 6px;
    }
  }
  .panes {
    position: relative;
  }
  .date-pop.at-editor {
    top: 8px;
    right: 12px;
  }
  /* Chips in the preview: [@task: #12], [@date: ...], [@time: ...], [@note: ...] */
  :global(.md .mention) {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0 7px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--hl1) 35%, transparent);
    background: color-mix(in srgb, var(--hl1) 10%, transparent);
    color: var(--t2);
    line-height: 1.5;
    vertical-align: baseline;
    cursor: pointer;
    outline: none;
  }
  :global(.md .mention:hover),
  :global(.md .mention:focus-visible) {
    border-color: var(--hl1);
    color: var(--hl1);
  }
  :global(.md .mention .ico) {
    position: relative;
    flex: none;
    box-sizing: border-box;
  }
  /* task: a circle, filled with a tick once done */
  :global(.md .mention.task .ico) {
    width: 10px;
    height: 10px;
    border: 1.5px solid var(--hl1);
    border-radius: 50%;
  }
  :global(.md .mention.task.done .ico) {
    background: var(--hl1);
  }
  :global(.md .mention.task.done .ico::after) {
    content: '';
    position: absolute;
    left: 2.2px;
    top: 0.6px;
    width: 2.5px;
    height: 5px;
    border: solid var(--bg1);
    border-width: 0 1.5px 1.5px 0;
    transform: rotate(45deg);
  }
  :global(.md .mention.task.done .lbl) {
    color: var(--t1);
    text-decoration: line-through;
  }
  /* date: a little calendar page; time: a clock */
  :global(.md .mention.date .ico) {
    width: 10px;
    height: 10px;
    border: 1.5px solid var(--hl1);
    border-top-width: 3px;
    border-radius: 2px;
  }
  :global(.md .mention.date.time .ico) {
    border-top-width: 1.5px;
    border-radius: 50%;
  }
  :global(.md .mention.date.time .ico::after) {
    content: '';
    position: absolute;
    left: 3px;
    top: 1px;
    width: 2.5px;
    height: 3px;
    border: solid var(--hl1);
    border-width: 0 0 1.5px 1.5px;
  }
  :global(.md .mention .rel) {
    color: var(--t1);
    font-size: 0.85em;
  }
  /* note: a page */
  :global(.md .mention.note) {
    border-color: color-mix(in srgb, var(--t1) 40%, transparent);
    background: color-mix(in srgb, var(--bg2) 35%, transparent);
  }
  :global(.md .mention.note .ico) {
    width: 8px;
    height: 10px;
    border: 1.5px solid var(--t1);
    border-radius: 1px;
  }
  :global(.md .mention.missing) {
    border-style: dashed;
    border-color: var(--t1);
    background: none;
    color: var(--t1);
  }
  :global(.md .mention.missing .ico) {
    border-color: var(--t1);
    background: none;
  }

  /* The card that hovering (or right-clicking) a chip opens. */
  .mcard {
    position: fixed;
    z-index: 120;
    width: 280px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    border: 1px solid var(--bg2);
    border-radius: 10px;
    background: var(--bg1);
    color: var(--t2);
    font-size: 12px;
    box-shadow: 0 16px 40px -14px color-mix(in srgb, var(--bg2) 80%, transparent);
  }
  .mcard.up {
    transform: translateY(-100%);
  }
  .mc-head {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .state {
    flex: none;
    width: 12px;
    height: 12px;
    margin-top: 3px;
    border: 1.5px solid var(--hl1);
    border-radius: 50%;
    box-sizing: border-box;
  }
  .state.done {
    background: var(--hl1);
  }
  .struck {
    color: var(--t1);
    text-decoration: line-through;
  }
  .mc-meta {
    color: var(--t1);
  }
  .badge {
    display: inline-block;
    margin-right: 6px;
    padding: 0 6px;
    border-radius: 999px;
    border: 1px solid var(--hl1);
    color: var(--hl1);
    font-size: 11px;
  }
  .badge.done {
    border-color: var(--t1);
    color: var(--t1);
  }
  .mc-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .mc-actions button {
    padding: 2px 9px;
    border: 1px solid var(--bg2);
    border-radius: 6px;
    color: var(--t2);
    font-size: 12px;
  }
  .mc-actions button:hover,
  .mc-actions button:focus-visible {
    border-color: var(--hl1);
    color: var(--hl1);
    outline: none;
  }
</style>
