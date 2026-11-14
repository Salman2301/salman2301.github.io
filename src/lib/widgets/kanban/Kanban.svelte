<script lang="ts">
  import type { Config } from '../../core/types';
  import { activeTaskId, addSpaceTags, addTask, cleanTag, INBOX_ID, isOverdue, projectOf, projects, removeSpaceTag, setTaskTags, tagsOf, tasks, toggleTask, type Task } from '../../core/tasks';
  import { friendlyDate } from '../../core/dates';
  import { repeatLabel } from '../../core/repeat';
  import { activeSpace, ALL } from '../../core/spaces';
  import { openMention, segments } from '../../core/mentions';
  import { ensureTaskNote, noteOfTask } from '../../core/tasknotes';
  import { mention } from '../../ui/mention';
  import { notes } from '../notes/store';

  export let paneId: string;
  export let focused = false;
  export let config: Config = {};
  export let updateConfig: (patch: Config) => void = () => {};
  $: void paneId, void focused;

  /**
   * A space's tasks on a board: a column per tag, plus one for tasks with
   * no tag. A task with two tags shows in both columns. Dragging a card (or
   * its column menu) swaps the column's tag for the new one. The tasks are
   * the same ones the Tasks widget lists.
   */

  type Filter = 'all' | 'active' | 'done';
  const FILTERS: Filter[] = ['active', 'all', 'done'];
  $: filter = ((config.filter as Filter) || 'active') as Filter;

  // A space chosen in the status bar wins; otherwise the pane's own choice, else the Inbox.
  $: inbox = $projects.find((p) => p.id === INBOX_ID) ?? $projects[0];
  $: project = $activeSpace !== ALL ? $projects.find((p) => p.id === $activeSpace) ?? inbox : $projects.find((p) => p.id === config.project) ?? inbox;
  $: chips = $activeSpace === ALL ? $projects : $projects.filter((p) => p.id === $activeSpace);
  $: projectTasks = $tasks.filter((t) => projectOf(t) === project.id);
  $: left = projectTasks.filter((t) => !t.done).length;
  $: spaceTags = tagsOf(project, $tasks);

  const NONE = '';
  $: columns = [...spaceTags, NONE];
  $: boardTasks = projectTasks.filter((t) => (!t.parentId || !projectTasks.some((p) => p.id === t.parentId)) && (filter === 'all' ? true : filter === 'done' ? t.done : !t.done));
  $: cards = Object.fromEntries(columns.map((c) => [c, boardTasks.filter((t) => (c === NONE ? !t.tags?.length : !!t.tags?.includes(c)))] as const)) as Record<string, Task[]>;

  function subCount(t: Task, all: Task[]): { done: number; total: number } {
    const subs = all.filter((s) => s.parentId === t.id);
    return { done: subs.filter((s) => s.done).length, total: subs.length };
  }

  const hasNote = (t: Task, list: typeof $notes) => !!noteOfTask(t, list) || !!t.notes?.trim();
  function openNote(id: string) {
    const n = ensureTaskNote(id);
    if (n) openMention('note', n.id);
  }

  function moveCard(id: string, from: string, to: string) {
    if (from === to) return;
    const t = $tasks.find((x) => x.id === id);
    if (!t) return;
    setTaskTags(id, to === NONE ? (t.tags ?? []).filter((x) => x !== from) : [...(t.tags ?? []).filter((x) => x !== from), to]);
  }

  let drag: { id: string; from: string } | null = null;
  let dropOn: string | null = null;
  function onCardDrag(e: DragEvent, id: string, from: string) {
    drag = { id, from };
    e.dataTransfer?.setData('text/plain', id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }
  function onColDrop(to: string) {
    if (drag) moveCard(drag.id, drag.from, to);
    drag = null;
    dropOn = null;
  }

  let addIn: string | null = null;
  let addText = '';
  function addToColumn(col: string) {
    if (addTask(addText, { projectId: project.id, tags: col === NONE ? [] : [col] })) addText = '';
  }

  let newTag = false;
  let newTagName = '';
  function createTag() {
    const name = cleanTag(newTagName);
    newTagName = '';
    newTag = false;
    if (name) addSpaceTags(project.id, [name]);
  }

  function deleteTag(name: string) {
    const used = projectTasks.filter((t) => t.tags?.includes(name)).length;
    if (used && !confirm(`Remove the tag #${name} from ${project.name}? ${used} ${used === 1 ? 'task loses' : 'tasks lose'} it; the tasks stay.`)) return;
    removeSpaceTag(project.id, name);
  }

  function focusOnMount(node: HTMLElement) {
    node.focus();
  }
</script>

<div class="kanban">
  <nav class="projects" aria-label="Spaces">
    {#each chips as p (p.id)}
      <button class="chip" class:on={p.id === project.id} on:click={() => updateConfig({ project: p.id })}>{p.name}</button>
    {/each}
  </nav>
  <header class="phead">
    <span class="pname">{project.name}</span>
    <span class="pleft">{left} left</span>
  </header>

  <div class="board" role="list" aria-label="Board of {project.name} by tag">
    {#each columns as col (col)}
      <section
        class="col"
        role="listitem"
        class:drop={dropOn === col && drag?.from !== col}
        aria-label={col ? `#${col}` : 'no tag'}
        on:dragover|preventDefault={() => (dropOn = col)}
        on:dragleave={() => dropOn === col && (dropOn = null)}
        on:drop|preventDefault={() => onColDrop(col)}
      >
        <header class="col-head">
          <span class="col-name">{col ? `#${col}` : 'no tag'}</span>
          <span class="n">{cards[col].filter((t) => !t.done).length}</span>
          <span class="spacer" />
          {#if col}<button class="tag-del" title="Remove this tag from {project.name}" aria-label="Remove tag {col}" on:click={() => deleteTag(col)}>x</button>{/if}
        </header>
        <ul class="cards">
          {#each cards[col] as t (t.id)}
            <li class="card" class:done={t.done} class:active={$activeTaskId === t.id} draggable="true" data-card={t.id} on:dragstart={(e) => onCardDrag(e, t.id, col)} on:dragend={() => ((drag = null), (dropOn = null))}>
              <div class="card-top">
                <input type="checkbox" checked={t.done} on:change={() => toggleTask(t.id)} aria-label="Done" />
                <span class="text">
                  <span class="no">#{t.no}</span>
                  {#each segments(t.text, $notes, $tasks) as seg}{#if seg.kind}<button class="ref" class:missing={seg.missing} on:click|stopPropagation={() => openMention(seg.kind, seg.id)}>{seg.label}</button>{:else}{seg.text}{/if}{/each}
                </span>
              </div>
              <div class="card-meta">
                {#if t.due}<span class="cdue" class:overdue={!t.done && isOverdue(t.due)} title="Reminder: {t.due}">{friendlyDate(t.due)}</span>{/if}
                {#if t.repeat}<span class="crep">↻ {repeatLabel(t.repeat)}</span>{/if}
                {#if subCount(t, $tasks).total}<span class="csubs" title="sub-tasks done">{subCount(t, $tasks).done}/{subCount(t, $tasks).total}</span>{/if}
                {#each (t.tags ?? []).filter((x) => x !== col) as other (other)}<span class="cother">#{other}</span>{/each}
                <span class="spacer" />
                <button class="cact" class:on={hasNote(t, $notes)} title={hasNote(t, $notes) ? 'Open its note' : 'Write a note for it'} aria-label="Note" on:click={() => openNote(t.id)}>≡</button>
                <select class="cact cmove" value={col} on:change={(e) => moveCard(t.id, col, e.currentTarget.value)} title="Move to another column" aria-label="Move to column">
                  {#each columns as c (c)}<option value={c}>{c === col ? (c ? `in #${c}` : 'no tag') : `→ ${c ? `#${c}` : 'no tag'}`}</option>{/each}
                </select>
              </div>
            </li>
          {/each}
        </ul>
        {#if addIn === col}
          <input
            class="pinput col-add"
            use:focusOnMount
            use:mention={'note'}
            bind:value={addText}
            placeholder="task, press enter"
            maxlength="200"
            aria-label="New task in {col ? `#${col}` : 'no tag'}"
            on:keydown={(e) => {
              if (e.key === 'Enter') addToColumn(col);
              if (e.key === 'Escape') addIn = null;
              e.stopPropagation();
            }}
            on:blur={() => (addIn = null)}
          />
        {:else}
          <button class="col-add-btn" on:click={() => ((addIn = col), (addText = ''))}>+ add</button>
        {/if}
      </section>
    {/each}
    <section class="col new-col">
      {#if newTag}
        <input
          class="pinput"
          use:focusOnMount
          bind:value={newTagName}
          placeholder="tag name"
          maxlength="24"
          aria-label="New tag name"
          on:keydown={(e) => {
            if (e.key === 'Enter') createTag();
            if (e.key === 'Escape') newTag = false;
            e.stopPropagation();
          }}
          on:blur={() => (newTag = false)}
        />
      {:else}
        <button class="col-add-btn" on:click={() => (newTag = true)}>+ tag column</button>
      {/if}
    </section>
  </div>

  <footer>
    <div class="filters">
      {#each FILTERS as f}<button class:on={filter === f} on:click={() => updateConfig({ filter: f })}>{f}</button>{/each}
    </div>
    <span>drag a card to change its tag</span>
  </footer>
</div>

<style>
  .kanban {
    height: 100%;
    display: flex;
    flex-direction: column;
    color: var(--t2);
    font-size: 13px;
  }
  .projects {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 8px 10px 0;
  }
  .chip {
    padding: 2px 8px;
    border: 1px solid var(--bg2);
    border-radius: 999px;
    color: var(--t1);
    font-size: 12px;
    white-space: nowrap;
  }
  .chip.on {
    border-color: var(--hl1);
    color: var(--hl1);
    background: color-mix(in srgb, var(--hl1) 12%, transparent);
  }
  .phead {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px 0;
    font-size: 11px;
    color: var(--t1);
  }
  .pname {
    color: var(--t2);
    font-size: 13px;
    font-weight: 600;
  }
  .tag-del {
    padding: 0 4px;
    font-size: 11px;
    color: var(--t1);
  }
  .tag-del:hover {
    color: var(--hl1);
  }
  .pinput {
    min-width: 0;
    width: 100%;
    padding: 2px 6px;
    border: 1px solid var(--hl1);
    border-radius: 4px;
    background: var(--bg1);
    color: var(--t2);
    font: inherit;
    font-size: 12px;
    outline: none;
  }
  .ref {
    display: inline;
    padding: 0 4px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--hl1) 14%, transparent);
    color: var(--hl1);
    font-size: 0.95em;
    text-align: left;
    cursor: pointer;
  }
  .ref.missing {
    background: none;
    color: var(--t1);
    text-decoration: line-through;
  }
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 10px;
    font-size: 11px;
    color: var(--t1);
    border-top: 1px dashed color-mix(in srgb, var(--bg2) 80%, transparent);
  }
  .filters {
    display: flex;
    gap: 2px;
  }
  footer button {
    padding: 1px 6px;
    border-radius: 4px;
    color: var(--t1);
  }
  footer button.on,
  footer button:hover {
    color: var(--hl1);
  }
  .board {
    flex: 1;
    min-height: 0;
    display: flex;
    gap: 8px;
    padding: 8px 10px;
    overflow-x: auto;
    align-items: flex-start;
  }
  .col {
    flex: 0 0 220px;
    max-height: 100%;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px;
    border: 1px solid var(--bg2);
    border-radius: 6px;
    background: color-mix(in srgb, var(--bg2) 25%, transparent);
  }
  .col.drop {
    border-color: var(--hl1);
    background: color-mix(in srgb, var(--hl1) 8%, transparent);
  }
  .col-head {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--t2);
  }
  .col-head .n {
    color: var(--hl1);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .col-head .spacer,
  .card-meta .spacer {
    flex: 1;
  }
  .cards {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow-y: auto;
    min-height: 8px;
  }
  .card {
    padding: 6px 8px;
    border-radius: 5px;
    background: var(--bg1);
    border: 1px solid var(--bg2);
    font-size: 12px;
    cursor: grab;
  }
  .card.active {
    border-color: color-mix(in srgb, var(--hl1) 60%, var(--bg2));
  }
  .card.done .text {
    opacity: 0.5;
    text-decoration: line-through;
  }
  .card-top {
    display: flex;
    gap: 6px;
    align-items: flex-start;
  }
  .card-top input {
    margin-top: 2px;
  }
  .card .text {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
    color: var(--t2);
  }
  .card .no {
    margin-right: 4px;
    color: var(--t1);
    font-size: 11px;
  }
  .card-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
    padding-left: 19px;
    font-size: 11px;
    color: var(--t1);
  }
  .cdue.overdue {
    color: var(--hl1);
  }
  .crep {
    color: var(--hl1);
    opacity: 0.85;
  }
  .cact {
    font-size: 11px;
    padding: 0 4px;
    border-radius: 4px;
    color: var(--t1);
  }
  .cact.on,
  .cact:hover {
    color: var(--hl1);
  }
  .cmove {
    max-width: 90px;
    border: 1px solid transparent;
    background: transparent;
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  .cmove:hover,
  .cmove:focus {
    border-color: var(--bg2);
  }
  .col-add-btn {
    align-self: flex-start;
    padding: 0 4px;
    font-size: 11px;
    color: var(--t1);
  }
  .col-add-btn:hover {
    color: var(--hl1);
  }
  .new-col {
    flex-basis: 140px;
    border-style: dashed;
    background: transparent;
  }
</style>
