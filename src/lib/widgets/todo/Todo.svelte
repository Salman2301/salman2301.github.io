<script lang="ts">
  import { tick } from 'svelte';
  import type { Config } from '../../core/types';
  import { activeTaskId, addTask, clearDone, formatSpent, isOverdue, removeTask, renameTask, setActiveTask, setDue, tasks, toggleTask } from '../../core/tasks';
  import DatePicker from '../../ui/DatePicker.svelte';

  export let paneId: string;
  export let focused = false;
  export let config: Config = {};
  export let updateConfig: (patch: Config) => void = () => {};
  $: void paneId;

  type Filter = 'all' | 'active' | 'done';
  const FILTERS: Filter[] = ['all', 'active', 'done'];
  $: filter = ((config.filter as Filter) || 'all') as Filter;

  let input: HTMLInputElement;
  let text = '';
  let editing: string | null = null;
  let editText = '';
  /** The task whose due-date picker is open. */
  let dueFor: string | null = null;

  $: list = $tasks.filter((t) => (filter === 'all' ? true : filter === 'done' ? t.done : !t.done));
  $: left = $tasks.filter((t) => !t.done).length;

  function add() {
    if (addTask(text)) text = '';
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
  }

  function onInputKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      (input.closest('.todo')?.querySelector('li.task') as HTMLElement | null)?.focus();
    }
  }

  let wasFocused = false;
  $: {
    if (focused && !wasFocused) tick().then(() => input?.focus({ preventScroll: true }));
    wasFocused = focused;
  }
</script>

<div class="todo">
  <form on:submit|preventDefault={add}>
    <input bind:this={input} bind:value={text} on:keydown={onInputKey} placeholder="add a task and press enter" maxlength="200" aria-label="New task" spellcheck="false" />
  </form>

  <ul>
    {#each list as t, i (t.id)}
      <!-- svelte-ignore a11y-no-noninteractive-tabindex a11y-no-noninteractive-element-interactions -->
      <li class="task" class:done={t.done} class:active={$activeTaskId === t.id} tabindex="0" on:keydown={(e) => onItemKey(e, t.id, i)}>
        <input type="checkbox" checked={t.done} on:change={() => toggleTask(t.id)} aria-label="Done" tabindex="-1" />
        {#if editing === t.id}
          <input class="edit" data-edit={t.id} bind:value={editText} on:blur={finishEdit} on:keydown={(e) => { if (e.key === 'Enter') finishEdit(); if (e.key === 'Escape') editing = null; e.stopPropagation(); }} />
        {:else}
          <span class="text" on:dblclick={() => startEdit(t.id, t.text)}>{t.text}</span>
        {/if}
        {#if t.pomodoros}<span class="count" title="{t.pomodoros} pomodoros">{t.pomodoros}p</span>{/if}
        {#if t.spentMs}<span class="spent" title="focus time on this task">{formatSpent(t.spentMs)}</span>{/if}
        <span class="due-wrap">
          <button class="due" class:overdue={!t.done && isOverdue(t.due)} class:none={!t.due} data-picker-toggle title="Set a due date" on:click={() => (dueFor = dueFor === t.id ? null : t.id)}>{t.due ?? 'due'}</button>
          {#if dueFor === t.id}
            <div class="due-pop">
              <DatePicker value={t.due ?? ''} withTime on:pick={(e) => { setDue(t.id, e.detail); dueFor = null; }} on:close={() => (dueFor = null)} />
            </div>
          {/if}
        </span>
        <button class="act" class:on={$activeTaskId === t.id} title="Focus on this in the pomodoro (f)" on:click={() => setActiveTask($activeTaskId === t.id ? null : t.id)} disabled={t.done}>focus</button>
        <button class="act del" title="Delete" aria-label="Delete task" on:click={() => removeTask(t.id)}>x</button>
      </li>
    {/each}
    {#if !list.length}
      <li class="empty">{filter === 'done' ? 'nothing done yet' : $tasks.length ? 'all done' : 'no tasks yet. Type one above.'}</li>
    {/if}
  </ul>

  <footer>
    <span>{left} left</span>
    <div class="filters">
      {#each FILTERS as f}<button class:on={filter === f} on:click={() => updateConfig({ filter: f })}>{f}</button>{/each}
    </div>
    <button on:click={clearDone} disabled={left === $tasks.length}>clear done</button>
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
  form {
    padding: 10px 10px 6px;
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
  .text {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
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
    color: #e5484d;
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
