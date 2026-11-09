<script lang="ts">
  import { tick } from 'svelte';
  import { activeSpace, ALL, currentSpace, deleteSpace, setActiveSpace } from '../core/spaces';
  import { addProject, INBOX_ID, projectOf, projects, renameProject, setProjectTheme, tasks } from '../core/tasks';
  import { darkThemes, isThemeName, lightThemes, themes, themeStore } from '../core/theme';
  import { notes, noteSpace } from '../widgets/notes/store';

  /**
   * The space switcher in the status bar. "All spaces" shows everything; a
   * space shows only its tasks, notes and reminders, in its own theme if it
   * has one. Each space can be renamed, themed or deleted here.
   */
  let open = false;
  let root: HTMLDivElement;
  let renaming: string | null = null;
  let renameText = '';
  let adding = false;
  let newName = '';
  let confirmDelete: string | null = null;

  $: openTasks = $tasks.reduce<Record<string, number>>((m, t) => (t.done ? m : ((m[projectOf(t)] = (m[projectOf(t)] ?? 0) + 1), m)), {});
  $: noteCount = $notes.reduce<Record<string, number>>((m, n) => ((m[noteSpace(n)] = (m[noteSpace(n)] ?? 0) + 1), m), {});
  /** The accent of a space's theme, or of the current theme. */
  const accentOf = (theme: string | undefined) => (isThemeName(theme) ? themes[theme][2] : themes[$themeStore][2]);

  function pick(id: string) {
    setActiveSpace(id);
    open = false;
  }

  async function startRename(id: string, name: string) {
    renaming = id;
    renameText = name;
    await tick();
    root?.querySelector<HTMLInputElement>('input.rename')?.select();
  }

  function finishRename() {
    if (renaming) renameProject(renaming, renameText);
    renaming = null;
  }

  function create() {
    const p = addProject(newName);
    newName = '';
    adding = false;
    if (p) setActiveSpace(p.id);
  }

  function remove(id: string) {
    if (confirmDelete !== id) {
      confirmDelete = id;
      setTimeout(() => confirmDelete === id && (confirmDelete = null), 3000);
      return;
    }
    confirmDelete = null;
    deleteSpace(id);
  }

  function focusOnMount(node: HTMLElement) {
    node.focus();
  }

  function onWindowDown(e: PointerEvent) {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }
  function onWindowKey(e: KeyboardEvent) {
    if (open && e.key === 'Escape') open = false;
  }
</script>

<svelte:window on:pointerdown|capture={onWindowDown} on:keydown={onWindowKey} />

<div class="spaces" bind:this={root}>
  <button
    class="trigger"
    class:filtered={$activeSpace !== ALL}
    aria-haspopup="menu"
    aria-expanded={open}
    title="Space: {$currentSpace?.name ?? 'all spaces'}. Filters tasks, notes and reminders."
    on:click={() => (open = !open)}
  >
    <span class="dot" style="background:{accentOf($currentSpace?.theme)}" />
    <span class="name">{$currentSpace?.name ?? 'all spaces'}</span>
  </button>

  {#if open}
    <div class="menu" role="menu" aria-label="Spaces">
      <button class="row all" class:on={$activeSpace === ALL} role="menuitemradio" aria-checked={$activeSpace === ALL} on:click={() => pick(ALL)}>
        <span class="radio" />
        <span class="label">All spaces</span>
        <span class="meta">everything</span>
      </button>
      {#each $projects as p (p.id)}
        <div class="row" class:on={$activeSpace === p.id}>
          {#if renaming === p.id}
            <input
              class="rename"
              bind:value={renameText}
              maxlength="40"
              aria-label="Space name"
              on:keydown={(e) => {
                if (e.key === 'Enter') finishRename();
                if (e.key === 'Escape') renaming = null;
                e.stopPropagation();
              }}
              on:blur={finishRename}
            />
          {:else}
            <button class="pickbtn" role="menuitemradio" aria-checked={$activeSpace === p.id} on:click={() => pick(p.id)}>
              <span class="radio" style="--accent:{accentOf(p.theme)}" />
              <span class="label">{p.name}</span>
              <span class="meta">{openTasks[p.id] ?? 0} tasks · {noteCount[p.id] ?? 0} notes</span>
            </button>
          {/if}
          <div class="tools">
            <select
              value={p.theme ?? ''}
              on:change={(e) => setProjectTheme(p.id, e.currentTarget.value || null)}
              title="Theme while {p.name} is active"
              aria-label="Theme for {p.name}"
            >
              <option value="">default theme</option>
              <optgroup label="dark">{#each darkThemes as name}<option value={name}>{name}</option>{/each}</optgroup>
              <optgroup label="light">{#each lightThemes as name}<option value={name}>{name}</option>{/each}</optgroup>
            </select>
            <button class="tool" title="Rename" aria-label="Rename {p.name}" on:click={() => startRename(p.id, p.name)}>rename</button>
            {#if p.id !== INBOX_ID}
              <button class="tool del" class:armed={confirmDelete === p.id} title="Delete: its tasks and notes move to the Inbox" on:click={() => remove(p.id)}>
                {confirmDelete === p.id ? 'sure?' : 'delete'}
              </button>
            {/if}
          </div>
        </div>
      {/each}
      {#if adding}
        <input
          class="rename new"
          use:focusOnMount
          bind:value={newName}
          placeholder="new space name"
          maxlength="40"
          aria-label="New space name"
          on:keydown={(e) => {
            if (e.key === 'Enter') create();
            if (e.key === 'Escape') adding = false;
            e.stopPropagation();
          }}
          on:blur={() => (adding = false)}
        />
      {:else}
        <button class="row add" on:click={() => (adding = true)}>+ new space</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .spaces {
    position: relative;
    display: flex;
    align-items: stretch;
  }
  /* matches the status bar's segments */
  .trigger {
    display: flex;
    align-items: center;
    padding: 0 10px;
    color: inherit;
    font: inherit;
    font-size: 12px;
    white-space: nowrap;
    gap: 6px;
    border-left: 1px solid color-mix(in srgb, var(--bg2) 80%, transparent);
    max-width: 160px;
  }
  .trigger .name {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .trigger:hover,
  .trigger[aria-expanded='true'] {
    color: var(--t2);
    background: color-mix(in srgb, var(--bg2) 70%, transparent);
  }
  .trigger.filtered {
    color: var(--t2);
  }
  .dot {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }
  .menu {
    position: fixed;
    right: 8px;
    bottom: 32px;
    z-index: 70;
    width: min(420px, calc(100vw - 16px));
    max-height: 60vh;
    overflow: auto;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    border: 1px solid var(--bg2);
    border-radius: 10px;
    background: var(--bg1);
    color: var(--t2);
    font-size: 12px;
    white-space: normal;
    box-shadow: 0 16px 40px -14px color-mix(in srgb, var(--bg2) 80%, transparent);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px;
    border-radius: 6px;
  }
  .row:hover,
  .row.on {
    background: color-mix(in srgb, var(--bg2) 40%, transparent);
  }
  button.row,
  .pickbtn {
    width: 100%;
    text-align: left;
    color: inherit;
  }
  .pickbtn {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .radio {
    flex: none;
    width: 10px;
    height: 10px;
    border: 1.5px solid var(--accent, var(--hl1));
    border-radius: 50%;
    box-sizing: border-box;
  }
  .on .radio {
    background: var(--accent, var(--hl1));
  }
  .label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }
  .meta {
    margin-left: auto;
    color: var(--t1);
    font-size: 11px;
    white-space: nowrap;
  }
  .tools {
    flex: none;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .tools select {
    max-width: 112px;
    padding: 1px 2px;
    border: 1px solid var(--bg2);
    border-radius: 4px;
    background: var(--bg1);
    color: var(--t1);
    font: inherit;
    font-size: 11px;
  }
  .tool {
    padding: 0 4px;
    color: var(--t1);
    font-size: 11px;
  }
  .tool:hover,
  .tool.armed {
    color: var(--hl1);
  }
  .rename {
    flex: 1;
    min-width: 0;
    padding: 3px 8px;
    border: 1px solid var(--hl1);
    border-radius: 6px;
    background: var(--bg1);
    color: var(--t2);
    font: inherit;
    font-size: 12px;
    outline: none;
  }
  .rename.new {
    margin: 4px 6px;
  }
  .add {
    color: var(--t1) !important;
  }
  .add:hover {
    color: var(--hl1) !important;
  }
  @media (max-width: 720px) {
    .trigger .name {
      max-width: 70px;
    }
  }
</style>
