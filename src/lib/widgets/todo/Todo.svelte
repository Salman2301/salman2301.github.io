<script lang="ts">
  import { tick } from 'svelte';
  import type { Config } from '../../core/types';
  import {
    activeTaskId,
    addProject,
    addTask,
    addTaskLines,
    clearDone,
    formatSpent,
    INBOX_ID,
    isOverdue,
    projectOf,
    projects,
    removeTask,
    renameProject,
    renameTask,
    revealTaskId,
    setActiveTask,
    setDue,
    setProjectNotes,
    setProjectTheme,
    setTaskNotes,
    tasks,
    toggleTask,
    type Task,
  } from '../../core/tasks';
  import { friendlyDate } from '../../core/dates';
  import { activeSpace, ALL, deleteSpace, setActiveSpace } from '../../core/spaces';
  import { darkThemes, lightThemes } from '../../core/theme';
  import { linksIn, openMention, segments } from '../../core/mentions';
  import type { Note } from '../../widgets/notes/store';
  import DatePicker from '../../ui/DatePicker.svelte';
  import { mention } from '../../ui/mention';
  import { notes } from '../../widgets/notes/store';

  export let paneId: string;
  export let focused = false;
  export let config: Config = {};
  export let updateConfig: (patch: Config) => void = () => {};
  $: void paneId;

  // Below this width a task's details and buttons move under its title.
  let width = 0;

  type Filter = 'all' | 'active' | 'done';
  const FILTERS: Filter[] = ['all', 'active', 'done'];
  $: filter = ((config.filter as Filter) || 'all') as Filter;

  /* ------------------------------------------------------------ spaces */

  // A space chosen in the status bar wins; otherwise each pane shows the
  // space in its config, falling back to the Inbox. (Spaces are "projects"
  // in the code and in storage.)
  $: inbox = $projects.find((p) => p.id === INBOX_ID) ?? $projects[0];
  $: project =
    $activeSpace !== ALL
      ? $projects.find((p) => p.id === $activeSpace) ?? inbox
      : $projects.find((p) => p.id === config.project) ?? inbox;
  $: chips = $activeSpace === ALL ? $projects : $projects.filter((p) => p.id === $activeSpace);
  $: projectTasks = $tasks.filter((t) => projectOf(t) === project.id);
  $: left = projectTasks.filter((t) => !t.done).length;
  $: openByProject = countOpen($tasks);

  function countOpen(all: Task[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const t of all) if (!t.done) counts[projectOf(t)] = (counts[projectOf(t)] ?? 0) + 1;
    return counts;
  }

  let newProject = false;
  let newProjectName = '';
  let renamingProject = false;
  let projectName = '';
  let projectNotesOpen = false;

  function createProject() {
    const p = addProject(newProjectName);
    newProjectName = '';
    newProject = false;
    if (!p) return;
    if ($activeSpace !== ALL) setActiveSpace(p.id);
    else updateConfig({ project: p.id });
  }

  function startRenameProject() {
    projectName = project.name;
    renamingProject = true;
  }

  function finishRenameProject() {
    if (renamingProject) renameProject(project.id, projectName);
    renamingProject = false;
  }

  function deleteProject() {
    const id = project.id;
    updateConfig({ project: INBOX_ID });
    deleteSpace(id);
  }

  /* ------------------------------------------------------------- rows */

  /**
   * Top-level tasks in this space, each followed by its sub-tasks. A row
   * shows when it matches the filter, or when one of its sub-tasks does.
   */
  $: rows = buildRows(projectTasks, filter);

  function buildRows(all: Task[], f: Filter): { task: Task; depth: number }[] {
    const keep = (t: Task) => (f === 'all' ? true : f === 'done' ? t.done : !t.done);
    const ids = new Set(all.map((t) => t.id));
    // A sub-task whose parent is gone (finished and cleared) is shown on its own.
    const tops = all.filter((t) => !t.parentId || !ids.has(t.parentId));
    const out: { task: Task; depth: number }[] = [];
    for (const t of tops) {
      const subs = all.filter((s) => s.parentId === t.id);
      if (!keep(t) && !subs.some(keep)) continue;
      out.push({ task: t, depth: 0 });
      for (const s of subs) if (keep(s)) out.push({ task: s, depth: 1 });
    }
    return out;
  }

  /** The @ links in a piece of text (notes and tasks), with live labels. */
  function linksOf(src: string, noteList: Note[], taskList: Task[]) {
    return linksIn(src, noteList, taskList);
  }

  function subCount(t: Task): { done: number; total: number } {
    const subs = $tasks.filter((s) => s.parentId === t.id);
    return { done: subs.filter((s) => s.done).length, total: subs.length };
  }

  /* ------------------------------------------------------------ input */

  let input: HTMLInputElement;
  let text = '';
  let editing: string | null = null;
  let editText = '';
  /** The task whose due-date picker is open. */
  let dueFor: string | null = null;
  /** The task whose notes are open. */
  let notesFor: string | null = null;
  /** The task that is getting a new sub-task. */
  let subFor: string | null = null;
  let subText = '';

  function add() {
    if (addTask(text, { projectId: project.id })) text = '';
  }

  function addSub(parent: string) {
    if (addTask(subText, { parentId: parent })) subText = '';
  }

  /**
   * Pasting several lines adds a task per line: list markers go, [x] items
   * come in done, and indented lines become sub-tasks. One line pastes as usual.
   */
  let pasteNote = '';
  let pasteTimer: ReturnType<typeof setTimeout> | undefined;
  function onPaste(e: ClipboardEvent, parentId?: string) {
    const data = e.clipboardData?.getData('text/plain') ?? '';
    if (!/[\r\n]/.test(data.trim())) return;
    e.preventDefault();
    const added = addTaskLines(data, parentId ? { parentId } : { projectId: project.id });
    pasteNote = added.length ? `added ${added.length} ${added.length === 1 ? 'task' : 'tasks'}` : 'nothing to add';
    if (pasteTimer) clearTimeout(pasteTimer);
    pasteTimer = setTimeout(() => (pasteNote = ''), 2500);
  }

  function openSub(id: string) {
    subFor = id;
    subText = '';
    dueFor = null;
  }

  async function startEdit(id: string, current: string) {
    editing = id;
    editText = current;
    await tick();
    (document.querySelector(`[data-edit="${id}"]`) as HTMLInputElement | null)?.select();
  }

  function finishEdit() {
    if (editing) renameTask(editing, editText);
    editing = null;
  }

  /** Focus the element as soon as it is rendered. */
  function focusOnMount(node: HTMLElement) {
    node.focus();
  }

  function onItemKey(e: KeyboardEvent, id: string, index: number) {
    if (editing) return;
    const items = Array.from((e.currentTarget as HTMLElement).parentElement!.querySelectorAll<HTMLElement>('li.task'));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = items[index + (e.key === 'ArrowDown' ? 1 : -1)];
      if (next) next.focus();
      else if (e.key === 'ArrowUp') input.focus();
    } else if (e.key === ' ') {
      e.preventDefault();
      toggleTask(id);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeTask(id);
      tick().then(() => (items[index + 1] ?? items[index - 1] ?? input)?.focus());
    } else if (e.key === 'Enter') startEdit(id, $tasks.find((t) => t.id === id)?.text ?? '');
    else if (e.key === 'f') setActiveTask($activeTaskId === id ? null : id);
    else if (e.key === 'n') notesFor = notesFor === id ? null : id;
    else if (e.key === 's' && !$tasks.find((t) => t.id === id)?.parentId) openSub(id);
  }

  function onInputKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      (input.closest('.todo')?.querySelector('li.task') as HTMLElement | null)?.focus();
    }
  }

  // An @ link from a note asks for this task: show its space, scroll to it and flash it.
  let flashId: string | null = null;
  $: if ($revealTaskId) reveal($revealTaskId);
  function reveal(id: string) {
    revealTaskId.set(null);
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-task="${id}"]`);
      el?.scrollIntoView({ block: 'center' });
      flashId = id;
      setTimeout(() => (flashId = null), 1400);
    }, 0);
  }

  let wasFocused = false;
  $: {
    if (focused && !wasFocused) tick().then(() => input?.focus({ preventScroll: true }));
    wasFocused = focused;
  }
</script>

<div class="todo" class:narrow={width > 0 && width < 460} bind:clientWidth={width}>
  <nav class="projects" aria-label="Spaces">
    {#each chips as p (p.id)}
      <button class="chip" class:on={p.id === project.id} on:click={() => updateConfig({ project: p.id })}>
        {p.name}
        {#if openByProject[p.id]}<span class="n">{openByProject[p.id]}</span>{/if}
      </button>
    {/each}
    {#if newProject}
      <input
        class="pinput"
        use:focusOnMount
        bind:value={newProjectName}
        placeholder="space name"
        maxlength="40"
        aria-label="New space name"
        on:keydown={(e) => {
          if (e.key === 'Enter') createProject();
          if (e.key === 'Escape') newProject = false;
          e.stopPropagation();
        }}
        on:blur={() => (newProject = false)}
      />
    {:else}
      <button class="chip add" on:click={() => (newProject = true)} title="New space">+</button>
    {/if}
  </nav>

  <header class="phead">
    {#if renamingProject}
      <input
        class="pinput"
        use:focusOnMount
        bind:value={projectName}
        maxlength="40"
        aria-label="Space name"
        on:keydown={(e) => {
          if (e.key === 'Enter') finishRenameProject();
          if (e.key === 'Escape') renamingProject = false;
          e.stopPropagation();
        }}
        on:blur={finishRenameProject}
      />
    {:else}
      <span class="pname">{project.name}</span>
    {/if}
    <span class="pleft">{left} left</span>
    <span class="spacer" />
    <button class:on={projectNotesOpen || !!project.notes} title="Notes for this space" on:click={() => (projectNotesOpen = !projectNotesOpen)}>notes</button>
    <select
      class="ptheme"
      value={project.theme ?? ''}
      on:change={(e) => setProjectTheme(project.id, e.currentTarget.value || null)}
      title="Theme while this space is active"
      aria-label="Space theme"
    >
      <option value="">default theme</option>
      <optgroup label="dark">{#each darkThemes as name}<option value={name}>{name}</option>{/each}</optgroup>
      <optgroup label="light">{#each lightThemes as name}<option value={name}>{name}</option>{/each}</optgroup>
    </select>
    <button on:click={startRenameProject} title="Rename space">rename</button>
    {#if project.id !== INBOX_ID}
      <button class="del" on:click={deleteProject} title="Delete space (its tasks and notes move to the Inbox)">delete</button>
    {/if}
  </header>

  {#if projectNotesOpen}
    <textarea
      class="notes project-notes"
      use:mention={'note'}
      value={project.notes}
      on:input={(e) => setProjectNotes(project.id, e.currentTarget.value)}
      placeholder="notes for {project.name}. @ links a note"
      aria-label="Space notes"
      spellcheck="false"
    />
    {#if linksOf(project.notes, $notes, $tasks).length}
      <div class="links">
        {#each linksOf(project.notes, $notes, $tasks) as l (l.id)}
          <button class="ref" class:missing={l.kind === 'note' && l.missing} on:click={() => openMention(l.kind, l.id)}>{l.label}</button>
        {/each}
      </div>
    {/if}
  {/if}

  <form on:submit|preventDefault={add}>
    <input bind:this={input} use:mention={'note'} bind:value={text} on:keydown={onInputKey} on:paste={(e) => onPaste(e)} placeholder="add a task to {project.name}. @tmrw sets a reminder, @ links a note" maxlength="200" aria-label="New task" spellcheck="false" />
  </form>
  {#if pasteNote}<p class="paste-note" role="status">{pasteNote}</p>{/if}

  <ul>
    {#each rows as { task: t, depth }, i (t.id)}
      <!-- svelte-ignore a11y-no-noninteractive-tabindex a11y-no-noninteractive-element-interactions -->
      <li class="task" class:sub={depth > 0} class:done={t.done} class:active={$activeTaskId === t.id} class:flash={flashId === t.id} data-task={t.id} tabindex="0" on:keydown={(e) => onItemKey(e, t.id, i)}>
        <input type="checkbox" checked={t.done} on:change={() => toggleTask(t.id)} aria-label="Done" tabindex="-1" />
        {#if editing === t.id}
          <input class="edit" data-edit={t.id} use:mention={'note'} bind:value={editText} on:blur={finishEdit} on:keydown={(e) => { if (e.key === 'Enter') finishEdit(); if (e.key === 'Escape') editing = null; e.stopPropagation(); }} />
        {:else}
          <span class="no" title="task number">#{t.no}</span>
          <span class="text" on:dblclick={() => startEdit(t.id, t.text)}>
            {#each segments(t.text, $notes, $tasks) as seg}{#if seg.kind}<button class="ref" class:missing={seg.missing} on:click|stopPropagation={() => openMention(seg.kind, seg.id)}>{seg.label}</button>{:else}{seg.text}{/if}{/each}
          </span>
        {/if}
        <div class="meta">
        {#if depth === 0 && subCount(t).total}
          <span class="subs" title="sub-tasks done">{subCount(t).done}/{subCount(t).total}</span>
        {/if}
        {#if t.pomodoros}<span class="count" title="{t.pomodoros} pomodoros">{t.pomodoros}p</span>{/if}
        {#if t.spentMs}<span class="spent" title="focus time on this task">{formatSpent(t.spentMs)}</span>{/if}
        <span class="due-wrap">
          <button class="due" class:overdue={!t.done && isOverdue(t.due)} class:none={!t.due} data-picker-toggle title={t.due ? `Reminder: ${t.due}` : 'Set a reminder (or type @tmrw, @monday in the task)'} on:click={() => (dueFor = dueFor === t.id ? null : t.id)}>{t.due ? friendlyDate(t.due) : 'due'}</button>
          {#if dueFor === t.id}
            <div class="due-pop">
              <DatePicker value={t.due ?? ''} withTime on:pick={(e) => { setDue(t.id, e.detail); dueFor = null; }} on:close={() => (dueFor = null)} />
            </div>
          {/if}
        </span>
        <span class="gap" />
        <button class="act" class:on={!!t.notes} title="Notes (n)" aria-label="Notes" on:click={() => (notesFor = notesFor === t.id ? null : t.id)}>≡</button>
        {#if depth === 0}
          <button class="act" title="Add a sub-task (s)" aria-label="Add sub-task" on:click={() => openSub(t.id)} disabled={t.done}>+</button>
        {/if}
        <button class="act" class:on={$activeTaskId === t.id} title="Focus on this in the pomodoro (f)" on:click={() => setActiveTask($activeTaskId === t.id ? null : t.id)} disabled={t.done}>focus</button>
        <button class="act del" title="Delete" aria-label="Delete task" on:click={() => removeTask(t.id)}>x</button>
        </div>
      </li>
      {#if notesFor === t.id}
        <li class="extra" class:sub={depth > 0}>
          <textarea
            class="notes"
            use:mention={'note'}
            value={t.notes ?? ''}
            on:input={(e) => setTaskNotes(t.id, e.currentTarget.value)}
            placeholder="notes for this task. @ links a note"
            aria-label="Task notes"
            spellcheck="false"
          />
          {#if linksOf(t.notes ?? '', $notes, $tasks).length}
            <div class="links">
              {#each linksOf(t.notes ?? '', $notes, $tasks) as l (l.id)}
                <button class="ref" class:missing={l.kind === 'note' && l.missing} on:click={() => openMention(l.kind, l.id)}>{l.label}</button>
              {/each}
            </div>
          {/if}
        </li>
      {/if}
      {#if subFor === t.id}
        <li class="extra sub">
          <input
            class="pinput"
            use:focusOnMount
            use:mention={'note'}
            bind:value={subText}
            on:paste={(e) => onPaste(e, t.id)}
            placeholder="sub-task, press enter"
            maxlength="200"
            aria-label="New sub-task"
            spellcheck="false"
            on:keydown={(e) => {
              if (e.key === 'Enter') addSub(t.id);
              if (e.key === 'Escape') subFor = null;
              e.stopPropagation();
            }}
            on:blur={() => (subFor = null)}
          />
        </li>
      {/if}
    {/each}
    {#if !rows.length}
      <li class="empty">{filter === 'done' ? 'nothing done yet' : projectTasks.length ? 'all done' : `no tasks in ${project.name} yet. Type one above.`}</li>
    {/if}
  </ul>

  <footer>
    <div class="filters">
      {#each FILTERS as f}<button class:on={filter === f} on:click={() => updateConfig({ filter: f })}>{f}</button>{/each}
    </div>
    <button on:click={clearDone} disabled={!$tasks.some((t) => t.done)}>clear done</button>
  </footer>
</div>

<style>
  .todo {
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
  .chip .n {
    margin-left: 4px;
    color: var(--hl1);
    font-variant-numeric: tabular-nums;
  }
  .chip.on {
    border-color: var(--hl1);
    color: var(--hl1);
    background: color-mix(in srgb, var(--hl1) 12%, transparent);
  }
  .chip.add:hover {
    color: var(--hl1);
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
  .spacer {
    flex: 1;
  }
  .phead button {
    padding: 0 4px;
    border-radius: 4px;
    color: var(--t1);
  }
  .phead button:hover,
  .phead button.on {
    color: var(--hl1);
  }
  .phead .del:hover {
    color: var(--t2);
  }
  .pinput {
    min-width: 0;
    width: 160px;
    padding: 2px 6px;
    border: 1px solid var(--hl1);
    border-radius: 4px;
    background: var(--bg1);
    color: var(--t2);
    font: inherit;
    font-size: 12px;
    outline: none;
  }
  .notes {
    display: block;
    width: calc(100% - 20px);
    min-height: 56px;
    margin: 4px 10px 0;
    padding: 6px 8px;
    border: 1px solid var(--bg2);
    border-radius: 6px;
    background: transparent;
    color: var(--t2);
    font: inherit;
    font-size: 12px;
    resize: vertical;
    outline: none;
  }
  .notes:focus {
    border-color: var(--hl1);
  }
  .ptheme {
    max-width: 120px;
    padding: 0 4px;
    border: 1px solid var(--bg2);
    border-radius: 4px;
    background: var(--bg1);
    color: var(--t1);
    font: inherit;
    font-size: 11px;
  }
  .project-notes {
    margin-bottom: 0;
  }
  form {
    padding: 8px 10px 6px;
  }
  form input {
    width: 100%;
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid var(--bg2);
    background: transparent;
    color: var(--t2);
    font: inherit;
    outline: none;
  }
  form input:focus {
    border-color: var(--hl1);
  }
  .paste-note {
    margin: -2px 12px 4px;
    color: var(--hl1);
    font-size: 11px;
  }
  ul {
    flex: 1;
    overflow: auto;
    margin: 0;
    padding: 0 6px;
    list-style: none;
  }
  .task {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 6px;
    border-radius: 6px;
    outline: none;
  }
  .task.sub {
    padding-left: 26px;
  }
  /* Wide: the details and buttons sit on the title's line. */
  .meta {
    display: contents;
  }
  .gap {
    display: none;
  }
  /* Narrow: the title gets the whole line; details and buttons go below it,
     details on the left, buttons on the right. */
  .narrow .task {
    flex-wrap: wrap;
    row-gap: 1px;
  }
  .narrow .text {
    flex-basis: 0;
  }
  .narrow .meta {
    display: flex;
    flex-basis: 100%;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding-left: 21px;
  }
  .narrow .gap {
    display: block;
    flex: 1;
  }
  .narrow .due-pop {
    right: auto;
    left: 0;
  }
  .narrow .act {
    opacity: 0.55;
  }
  .narrow .task:hover .act,
  .narrow .task:focus .act,
  .narrow .act.on {
    opacity: 1;
  }
  .task:hover,
  .task:focus {
    background: color-mix(in srgb, var(--bg2) 45%, transparent);
  }
  .task.active {
    box-shadow: inset 2px 0 0 var(--hl1);
    background: color-mix(in srgb, var(--hl1) 12%, transparent);
  }
  .task input[type='checkbox'] {
    accent-color: var(--hl1);
    cursor: pointer;
  }
  .extra {
    padding: 0 6px 4px;
  }
  .extra.sub {
    padding-left: 26px;
  }
  .extra .notes,
  .extra .pinput {
    margin: 0;
    width: 100%;
  }
  .text {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .no {
    flex: 0 0 auto;
    font-size: 11px;
    color: var(--t1);
    font-variant-numeric: tabular-nums;
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
  .ref:hover {
    text-decoration: underline;
  }
  .ref.missing {
    background: none;
    color: var(--t1);
    text-decoration: line-through;
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 4px 10px 0;
    font-size: 12px;
  }
  .task.flash {
    animation: flash 1.4s ease-out;
  }
  @keyframes flash {
    from {
      background: color-mix(in srgb, var(--hl1) 35%, transparent);
    }
    to {
      background: transparent;
    }
  }
  .done .text {
    text-decoration: line-through;
    color: var(--t1);
  }
  .edit {
    flex: 1;
    min-width: 0;
    padding: 1px 4px;
    border: 1px solid var(--hl1);
    border-radius: 4px;
    background: var(--bg1);
    color: var(--t2);
    font: inherit;
    outline: none;
  }
  .subs {
    font-size: 11px;
    color: var(--t1);
    font-variant-numeric: tabular-nums;
  }
  .count {
    font-size: 11px;
    color: var(--hl1);
  }
  .spent {
    font-size: 11px;
    color: var(--t1);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .due-wrap {
    position: relative;
    flex: 0 0 auto;
  }
  .due {
    font-size: 11px;
    padding: 0 6px;
    border-radius: 4px;
    color: var(--t1);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .due.none {
    opacity: 0.5;
  }
  .due:hover {
    color: var(--hl1);
  }
  .due.overdue {
    color: var(--hl1);
    text-decoration: underline wavy;
  }
  .due-pop {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 60;
  }
  .act {
    font-size: 11px;
    padding: 0 6px;
    border-radius: 4px;
    color: var(--t1);
    opacity: 0;
  }
  .task:hover .act,
  .task:focus .act,
  .act.on {
    opacity: 1;
  }
  .act.on,
  .act:hover {
    color: var(--hl1);
  }
  .act:disabled {
    visibility: hidden;
  }
  .empty {
    padding: 12px 8px;
    color: var(--t1);
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
  footer button:hover:not(:disabled) {
    color: var(--hl1);
  }
  footer button:disabled {
    opacity: 0.4;
  }
  @media (hover: none) {
    .act {
      opacity: 1;
    }
  }
</style>
