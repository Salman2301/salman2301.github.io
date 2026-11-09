<script lang="ts">
  import { isTouch } from '../../core/device';
  import { onDestroy, onMount, tick } from 'svelte';
  import type { Config } from '../../core/types';
  import { renderMarkdown, toggleTask } from './markdown';
  import { createNote, deleteNote, moveNote, notes, noteSpace, reorderNotes, sortNotes, timeAgo, titleOf, togglePin, updateNote } from './store';
  import { activeSpace, spaceForNew, visibleIn } from '../../core/spaces';
  import DatePicker from '../../ui/DatePicker.svelte';
  import { focusOn } from '../pomodoro/engine';
  import { dateToken, openMention, relabel, resolveForHtml, splitLabel, type MentionKind } from '../../core/mentions';
  import { friendlyDate, parseDate, relativeDay } from '../../core/dates';
  import { projectOf, projects, tasks, toggleTask as toggleTaskDone } from '../../core/tasks';

  export let paneId: string;
  export let focused = false;
  export let config: Config = {};
  export let updateConfig: (patch: Config) => void = () => {};

  /**
   * live: rendered in place, the line being edited shows its markdown
   * (like Obsidian's Live Preview). source: plain markdown. read: reading view.
   */
  type Mode = 'live' | 'source' | 'read';
  const MODES: { id: Mode; title: string }[] = [
    { id: 'live', title: 'Live preview: rendered, the line you edit shows its markdown' },
    { id: 'source', title: 'Source: plain markdown' },
    { id: 'read', title: 'Reading view' },
  ];
  // Older panes saved edit / split / preview.
  const toMode = (v: unknown): Mode => (v === 'source' || v === 'read' ? v : v === 'preview' ? 'read' : 'live');

  interface EditorApi {
    focus(): void;
    setCursor(pos: number): void;
    insert(text: string, at?: number): void;
    coordsAt(pos?: number): { left: number; top: number; bottom: number } | null;
    setText(text: string): void;
  }
  // CodeMirror loads with the first notes pane, not with the page.
  let LiveEditor: typeof import('./editor/LiveEditor.svelte').default | null = null;
  let editor: EditorApi | null = null;
  onMount(async () => {
    LiveEditor = (await import('./editor/LiveEditor.svelte')).default;
  });

  let width = 0;
  let fileInput: HTMLInputElement;
  let search = '';
  let sidebarOpen: boolean | null = null; // null = automatic from width
  let confirmDelete = false;
  let confirmTimer: ReturnType<typeof setTimeout> | undefined;

  // Only the notes of the active space (all of them under "all spaces").
  $: sorted = sortNotes($notes).filter((n) => visibleIn($activeSpace, noteSpace(n)));
  $: current = sorted.find((n) => n.id === config.noteId) ?? sorted[0];
  $: narrow = width > 0 && width < 560;
  $: showSidebar = sidebarOpen ?? (!narrow && width > 0);
  $: mode = toMode(config.mode);
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
  $: html = mode === 'read' ? renderMarkdown(resolveForHtml(draft, $notes, $tasks)) : '';

  // Chips in the editor show live task status and titles: redraw on changes.
  let chipTick = 0;
  const offTasks = tasks.subscribe(() => chipTick++);
  const offNotes = notes.subscribe(() => chipTick++);
  onDestroy(() => {
    offTasks();
    offNotes();
  });
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
    tick().then(() => editor?.focus());
  }

  function newNote() {
    const n = createNote('# ', spaceForNew());
    open(n.id);
    // after the editor has loaded the new note
    tick().then(() => setTimeout(() => editor?.setCursor(2), 0));
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

  /* -------------------------------------------------------- date / time */

  let pickerOpen = false;
  let pickerTime = false;

  /** Where the picked date goes, and where the picker sits (at the caret). */
  let pickerPos = 0;
  let pickerStyle = '';

  /** The date picker writes [@date: 2026-11-28] or [@time: 2026-11-28 15:20]. */
  function pickDate(e: CustomEvent<string>) {
    pickerOpen = false;
    if (e.detail) editor?.insert(`${dateToken(e.detail)} `, pickerPos);
    else editor?.focus();
  }

  /** Opened from the @ list ("pick a date…"), right under the caret. */
  function openPickerAt(action: 'pick-date' | 'pick-time', pos: number) {
    pickerTime = action === 'pick-time';
    pickerPos = pos;
    const c = editor?.coordsAt(pos);
    const left = Math.max(8, Math.min(c?.left ?? 40, window.innerWidth - 300));
    const below = !c || c.bottom + 380 < window.innerHeight;
    pickerStyle = c
      ? below
        ? `left:${left}px;top:${c.bottom + 6}px`
        : `left:${left}px;top:${c.top - 6}px;transform:translateY(-100%)`
      : `left:${left}px;top:120px`;
    pickerOpen = true;
  }

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
    focusOn(cardTask.id);
    card = null;
  }

  /* rename: the link's own label ([@task: #3-My label]); empty = the task's name */
  let renaming = false;
  let renameText = '';

  function startCardRename() {
    if (!card || card.kind === 'date') return;
    renameText = splitLabel(card.kind, card.ref).label ?? '';
    renaming = true;
    card = { ...card, pinned: true };
    tick().then(() => cardEl?.querySelector<HTMLInputElement>('input.mc-rename')?.select());
  }

  function finishCardRename() {
    if (!card || card.kind === 'date') return;
    const next = relabel(draft, card.kind, card.ref, renameText);
    if (editor) editor.setText(next);
    else {
      draft = next;
      onEdit();
    }
    renaming = false;
    card = null;
  }

  // a different chip (or none) ends any rename in progress
  $: if (!card) renaming = false;

  async function cardCopy() {
    if (!card) return;
    try {
      await navigator.clipboard.writeText(card.kind === 'date' ? `[@${card.id.length > 10 ? 'time' : 'date'}: ${card.id}]` : card.ref);
    } catch {
      /* clipboard blocked */
    }
    card = null;
  }


  function onEditorChange(text: string) {
    draft = text;
    onEdit();
  }

  /** In the editor, a click on a chip opens what it points at. */
  function onEditorClick(e: MouseEvent) {
    const chip = chipOf(e);
    if (!chip) return;
    e.preventDefault();
    card = null;
    openMention(chip.dataset.kind as MentionKind, chip.dataset.id ?? '');
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
    const n = createNote(text.slice(0, 200_000), spaceForNew());
    fileInput.value = '';
    open(n.id);
  }

  /* ------------------------------------------------------ reordering */

  // Drag a note in the list to move it; Mod+Shift+↑/↓ does the same from the keyboard.
  let dragId: string | null = null;
  let overId: string | null = null;
  let overAfter = false;

  function onDragStart(e: DragEvent, id: string) {
    dragId = id;
    e.dataTransfer?.setData('text/plain', id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  function onDragOver(e: DragEvent, id: string) {
    if (!dragId) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    overId = id;
    overAfter = e.clientY > r.top + r.height / 2;
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    if (dragId && overId && dragId !== overId) {
      const ids = filtered.map((n) => n.id).filter((id) => id !== dragId);
      ids.splice(ids.indexOf(overId) + (overAfter ? 1 : 0), 0, dragId);
      reorderNotes(ids);
    }
    endDrag();
  }

  function endDrag() {
    dragId = null;
    overId = null;
  }

  function onItemKey(e: KeyboardEvent, id: string) {
    if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || search.trim()) return;
    e.preventDefault();
    const ids = filtered.map((n) => n.id);
    const i = ids.indexOf(id);
    const j = i + (e.key === 'ArrowUp' ? -1 : 1);
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorderNotes(ids);
    tick().then(() => (document.querySelector(`[data-note-item="${id}"]`) as HTMLElement | null)?.focus());
  }

  /* ------------------------------------------------------------- focus */

  let wasFocused = false;
  $: {
    if (focused && !wasFocused && !isTouch()) tick().then(() => editor?.focus());
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
          <li
            draggable={!search.trim()}
            class:dragging={dragId === n.id}
            class:drop-before={overId === n.id && dragId !== n.id && !overAfter}
            class:drop-after={overId === n.id && dragId !== n.id && overAfter}
            on:dragstart={(e) => onDragStart(e, n.id)}
            on:dragover={(e) => onDragOver(e, n.id)}
            on:drop={onDrop}
            on:dragend={endDrag}
          >
            <button
              class="item"
              class:active={current?.id === n.id}
              data-note-item={n.id}
              title={search.trim() ? undefined : 'Drag to reorder (or Mod+Shift+↑/↓)'}
              on:click={() => open(n.id)}
              on:keydown={(e) => onItemKey(e, n.id)}
            >
              <span class="t">{#if n.pinned}<span class="pin">*</span>{/if}{titleOf(n)}</span>
              <span class="m">{timeAgo(n.updatedAt)}</span>
            </button>
          </li>
        {/each}
        {#if filtered.length === 0}<li class="empty">{search ? 'no matches' : 'no notes in this space yet'}</li>{/if}
      </ul>
      <div class="side-foot">
        <button on:click={() => fileInput.click()}>import .md</button>
        <span>{sorted.length} {sorted.length === 1 ? 'note' : 'notes'}</span>
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
          <button class:on={mode === m.id} title={m.title} on:click={() => setMode(m.id)}>{m.id}</button>
        {/each}
      </div>
      {#if current}
        <select class="space-pick" value={noteSpace(current)} on:change={(e) => current && moveNote(current.id, e.currentTarget.value)} title="Space this note belongs to" aria-label="Space">
          {#each $projects as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
        </select>
        <button class="txt" title="Pin to the top" on:click={() => togglePin(current.id)}>{current.pinned ? 'unpin' : 'pin'}</button>
        <button class="txt" title="Download as .md" on:click={exportNote}>export</button>
        <button class="txt danger" class:armed={confirmDelete} on:click={remove}>{confirmDelete ? 'confirm?' : 'delete'}</button>
      {/if}
    </div>

    {#if current}
      <div class="panes mode-{mode}">
        {#if pickerOpen && mode !== 'read'}
          <div class="date-pop at-caret" style={pickerStyle}>
            <DatePicker withTime={pickerTime} on:pick={pickDate} on:close={() => (pickerOpen = false)} />
          </div>
        {/if}
        {#if mode !== 'read'}
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions a11y-mouse-events-have-key-events -->
          <div class="editor-wrap" on:click={onEditorClick} on:mouseover={onPreviewOver} on:mouseout={onPreviewOut} on:contextmenu={onPreviewMenu}>
            {#if LiveEditor}
              <svelte:component
                this={LiveEditor}
                bind:this={editor}
                value={draft}
                docKey={current.id}
                live={mode === 'live'}
                placeholder="Write here. # for a heading, - for a list, @ for a task, @time, @date or @tmrw."
                refresh={chipTick}
                onChange={onEditorChange}
                onSave={flush}
                onBlur={flush}
                onAction={openPickerAt}
              />
            {:else}
              <p class="loading">loading the editor…</p>
            {/if}
          </div>
        {:else}
          <!-- Chips are focusable; focusin/focusout below give keyboard users the same card as hover. -->
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions a11y-mouse-events-have-key-events -->
          <article
            class="md"
            on:scroll={() => {
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
            <span class="tstate" class:done={cardTask.done} aria-hidden="true" />
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
            <button on:click={startCardRename} title="Show your own label instead of the task name">rename</button>
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
        <div class="mc-actions">
          <button on:click={cardOpen}>open note</button>
          <button on:click={startCardRename} title="Show your own label instead of the note title">rename</button>
        </div>
      {:else}
        <div class="mc-head">note "{card.ref}" not found</div>
      {/if}
      {#if renaming}
        <input
          class="mc-rename"
          bind:value={renameText}
          placeholder={card.kind === 'task' ? 'label (empty = task name)' : 'label (empty = note title)'}
          maxlength="80"
          aria-label="Link label"
          on:keydown={(e) => {
            if (e.key === 'Enter') finishCardRename();
            if (e.key === 'Escape') renaming = false;
            e.stopPropagation();
          }}
        />
        <div class="mc-meta">Enter to save. Renames every link to it in this note; the link still opens the {card.kind}.</div>
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
  .editor-wrap {
    min-height: 0;
    min-width: 0;
    overflow: hidden;
  }
  .loading {
    padding: 14px 20px;
    color: var(--t1);
  }
  .md {
    overflow: auto;
    padding: 12px 16px 24px;
    line-height: 1.65;
    min-width: 0;
  }
  .side li.dragging {
    opacity: 0.4;
  }
  .side li.drop-before {
    box-shadow: inset 0 2px 0 var(--hl1);
  }
  .side li.drop-after {
    box-shadow: inset 0 -2px 0 var(--hl1);
  }
  .side li[draggable='true'] .item {
    cursor: grab;
  }
  .space-pick {
    max-width: 120px;
    padding: 1px 4px;
    border: 1px solid var(--bg2);
    border-radius: 6px;
    background: var(--bg1);
    color: var(--t1);
    font: inherit;
    font-size: 11px;
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
  /* accordions (<details>) in the reading view */
  .md :global(details) {
    margin: 0.6em 0;
    padding: 4px 10px;
    border-left: 2px solid var(--hl1);
    border-radius: 0 6px 6px 0;
    background: color-mix(in srgb, var(--bg2) 22%, transparent);
  }
  .md :global(summary) {
    cursor: pointer;
    font-weight: 700;
    color: var(--t2);
  }
  .md :global(summary::marker) {
    color: var(--hl1);
  }
  .md :global(details[open] > summary) {
    margin-bottom: 0.4em;
  }
  .md :global(strong) {
    color: var(--t2);
    font-weight: 700;
  }

  @media (max-width: 720px) {
    /* One row that scrolls sideways, so pin / export / delete stay reachable without wrapping. */
    .bar {
      overflow-x: auto;
      scrollbar-width: none;
      overscroll-behavior-x: contain;
    }
    .bar::-webkit-scrollbar {
      display: none;
    }
    .bar > :global(*) {
      flex: 0 0 auto;
    }
    /* the pane header already shows the note's title */
    .title {
      display: none;
    }
    .bar .txt {
      min-height: 28px;
      padding: 0 6px;
    }
  }
  .panes {
    position: relative;
  }
  .date-pop.at-caret {
    position: fixed;
    right: auto;
    z-index: 130;
  }
  /* Chips in the editor and the reading view: [@task: #12], [@date: ...], [@time: ...], [@note: ...] */
  .notes :global(.mention) {
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
  .notes :global(.mention:hover),
  .notes :global(.mention:focus-visible) {
    border-color: var(--hl1);
    color: var(--hl1);
  }
  .notes :global(.mention .ico) {
    position: relative;
    flex: none;
    box-sizing: border-box;
  }
  /* task: a circle, filled with a tick once done */
  .notes :global(.mention.task .ico) {
    width: 10px;
    height: 10px;
    border: 1.5px solid var(--hl1);
    border-radius: 50%;
  }
  .notes :global(.mention.task.done .ico) {
    background: var(--hl1);
  }
  .notes :global(.mention.task.done .ico::after) {
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
  .notes :global(.mention.task.done .lbl) {
    color: var(--t1);
    text-decoration: line-through;
  }
  /* date: a little calendar page; time: a clock */
  .notes :global(.mention.date .ico) {
    width: 10px;
    height: 10px;
    border: 1.5px solid var(--hl1);
    border-top-width: 3px;
    border-radius: 2px;
  }
  .notes :global(.mention.date.time .ico) {
    border-top-width: 1.5px;
    border-radius: 50%;
  }
  .notes :global(.mention.date.time .ico::after) {
    content: '';
    position: absolute;
    left: 3px;
    top: 1px;
    width: 2.5px;
    height: 3px;
    border: solid var(--hl1);
    border-width: 0 0 1.5px 1.5px;
  }
  .notes :global(.mention .rel) {
    color: var(--t1);
    font-size: 0.85em;
  }
  /* note: a page */
  .notes :global(.mention.note) {
    border-color: color-mix(in srgb, var(--t1) 40%, transparent);
    background: color-mix(in srgb, var(--bg2) 35%, transparent);
  }
  .notes :global(.mention.note .ico) {
    width: 8px;
    height: 10px;
    border: 1.5px solid var(--t1);
    border-radius: 1px;
  }
  .notes :global(.mention.missing) {
    border-style: dashed;
    border-color: var(--t1);
    background: none;
    color: var(--t1);
  }
  .notes :global(.mention.missing .ico) {
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
  .tstate {
    flex: none;
    width: 12px;
    height: 12px;
    margin-top: 3px;
    border: 1.5px solid var(--hl1);
    border-radius: 50%;
    box-sizing: border-box;
  }
  .tstate.done {
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
  .mc-rename {
    width: 100%;
    padding: 4px 8px;
    border: 1px solid var(--hl1);
    border-radius: 6px;
    background: var(--bg1);
    color: var(--t2);
    font: inherit;
    font-size: 12px;
    outline: none;
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
