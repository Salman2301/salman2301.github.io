<script lang="ts">
  import { tick } from 'svelte';
  import { closeTab, newTab, renameTab, switchTab, workspace } from '../core/workspace';
  import { projects } from '../core/tasks';
  import { isThemeName, themes, themeStore } from '../core/theme';

  /** The space a tab is pinned to, if any, for the little marker on the tab. */
  $: spaceOf = (id?: string) => (id ? $projects.find((p) => p.id === id) ?? null : null);
  const accent = (theme: string | undefined) => (isThemeName(theme) ? themes[theme][2] : themes[$themeStore][2]);

  let editing: string | null = null;
  let draft = '';

  async function rename(id: string, name: string) {
    editing = id;
    draft = name;
    await tick();
    (document.querySelector('.tab-edit') as HTMLInputElement | null)?.select();
  }
  function commitRename() {
    if (editing) renameTab(editing, draft);
    editing = null;
  }
</script>

<nav class="tabbar" aria-label="Tabs">
  {#each $workspace.tabs as t, i (t.id)}
    <div class="tab" class:active={t.id === $workspace.active}>
      {#if editing === t.id}
        <input
          class="tab-edit"
          bind:value={draft}
          on:keydown={(e) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') editing = null;
          }}
          on:blur={commitRename}
          aria-label="Tab name"
        />
      {:else}
        <button class="name" on:click={() => switchTab(t.id)} on:dblclick={() => rename(t.id, t.name)} title="Double-click to rename (Alt+[ / Alt+])">
          <span class="num">{i + 1}</span>{t.name}
          {#if spaceOf(t.space)}
            <span class="space" title="Pinned to the space {spaceOf(t.space)?.name}">
              <span class="sdot" style="background:{accent(spaceOf(t.space)?.theme)}" />{spaceOf(t.space)?.name}
            </span>
          {/if}
        </button>
      {/if}
      {#if $workspace.tabs.length > 1}
        <button class="x" on:click={() => closeTab(t.id)} aria-label="Close tab {t.name}" title="Close tab">×</button>
      {/if}
    </div>
  {/each}
  <button class="add" on:click={() => newTab()} aria-label="New tab" title="New tab (Alt+N)">+</button>
</nav>

<style>
  .tabbar {
    display: flex;
    align-items: stretch;
    gap: 2px;
    flex: 0 0 28px;
    height: 28px;
    padding: 0 4px;
    overflow-x: auto;
    overflow-y: hidden;
    font-size: 12px;
    color: var(--t1);
    background: color-mix(in srgb, var(--bg2) 30%, var(--bg1));
    border-bottom: 1px solid color-mix(in srgb, var(--bg2) 80%, transparent);
    user-select: none;
    scrollbar-width: none;
  }
  .tab {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
    gap: 2px;
    margin-top: 4px;
    padding: 0 4px 0 0;
    border-radius: 6px 6px 0 0;
  }
  .tab:hover {
    background: color-mix(in srgb, var(--bg2) 50%, transparent);
  }
  .tab.active {
    color: var(--bg1);
    background: var(--hl1);
  }
  .name {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 24px;
    padding: 0 6px 0 8px;
    max-width: 180px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: inherit;
  }
  .num {
    opacity: 0.7;
    font-variant-numeric: tabular-nums;
  }
  .x {
    width: 16px;
    height: 16px;
    display: grid;
    place-items: center;
    border-radius: 4px;
    color: inherit;
    opacity: 0.6;
    line-height: 1;
  }
  .x:hover {
    opacity: 1;
    background: color-mix(in srgb, var(--bg1) 30%, transparent);
  }
  .tab-edit {
    width: 120px;
    height: 22px;
    padding: 0 6px;
    margin: 0 2px;
    border-radius: 4px;
    border: 1px solid var(--hl1);
    background: var(--bg1);
    color: var(--t2);
    font: inherit;
    font-size: 12px;
    outline: none;
  }
  .add {
    flex: 0 0 auto;
    align-self: center;
    width: 24px;
    height: 24px;
    margin-left: 2px;
    border-radius: 6px;
    color: var(--t1);
    font-size: 16px;
    line-height: 1;
  }
  .add:hover {
    color: var(--hl1);
    background: color-mix(in srgb, var(--bg2) 60%, transparent);
  }
  @media (max-width: 720px) {
    .tabbar {
      position: sticky;
      top: 0;
      z-index: 30;
    }
  }
  .space {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: 6px;
    padding: 0 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--bg2) 50%, transparent);
    color: var(--t1);
    font-size: 10px;
  }
  .sdot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
</style>
