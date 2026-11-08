<script lang="ts">
  import { tick } from 'svelte';
  import { templatePickerOpen } from '../core/ui';
  import { allTemplates, applyTemplate, deleteTemplate, savedTemplates, saveCurrentAsTemplate } from '../core/templates';
  import { workspace } from '../core/workspace';
  import { notify } from '../core/notify';
  import MiniLayout from './MiniLayout.svelte';

  let selected = 0;
  let saveName = '';
  let dialog: HTMLDivElement;
  let grid: HTMLDivElement;

  // re-read when custom templates change
  $: list = allTemplates($savedTemplates);
  $: if ($templatePickerOpen) onOpen();

  async function onOpen() {
    const current = list.findIndex((t) => t.id === $workspace.template);
    selected = current >= 0 ? current : 0;
    await tick();
    (grid?.querySelectorAll('button.card')[selected] as HTMLElement | undefined)?.focus();
  }

  function close() {
    templatePickerOpen.set(false);
  }

  function apply(id: string) {
    applyTemplate(id);
    close();
  }

  function columns(): number {
    if (!grid) return 3;
    const first = grid.querySelector('button.card') as HTMLElement | null;
    if (!first) return 3;
    return Math.max(1, Math.round(grid.clientWidth / (first.offsetWidth + 12)));
  }

  async function move(delta: number) {
    selected = Math.min(Math.max(selected + delta, 0), list.length - 1);
    await tick();
    (grid?.querySelectorAll('button.card')[selected] as HTMLElement | undefined)?.focus();
  }

  function onKey(e: KeyboardEvent) {
    if (!$templatePickerOpen) return;
    if ((e.target as HTMLElement)?.tagName === 'INPUT') {
      if (e.key === 'Escape') close();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(columns());
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(-columns());
    }
  }

  function save() {
    const name = saveName.trim();
    if (!name) return;
    const id = saveCurrentAsTemplate(name);
    if (id) {
      notify('Template saved', { body: `"${name}" is now in your templates.`, tone: 'success' });
      saveName = '';
    } else notify('Pick another name', { body: 'That name is taken by a built-in template.', tone: 'error' });
  }
</script>

<svelte:window on:keydown={onKey} />

{#if $templatePickerOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div class="backdrop" on:click|self={close}>
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Choose a layout template" bind:this={dialog}>
      <div class="head">
        <div>
          <h2>Templates</h2>
          <p>Pick a layout. Every pane can still be split, resized, dragged and swapped afterwards.</p>
        </div>
        <button class="x" on:click={close} aria-label="Close">esc</button>
      </div>

      <div class="grid" bind:this={grid}>
        {#each list as t, i (t.id)}
          <button
            class="card"
            class:selected={i === selected}
            class:current={t.id === $workspace.template}
            on:click={() => apply(t.id)}
            on:focus={() => (selected = i)}
          >
            <div class="preview"><MiniLayout node={t.build()} /></div>
            <div class="meta">
              <span class="name">{t.title}{#if t.id === $workspace.template}<span class="tag">current</span>{/if}</span>
              <span class="desc">{t.description}</span>
            </div>
            {#if t.custom}
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <span class="del" role="button" tabindex="-1" title="Delete template" on:click|stopPropagation={() => deleteTemplate(t.id)}>delete</span>
            {/if}
          </button>
        {/each}
      </div>

      <form class="save" on:submit|preventDefault={save}>
        <span class="label">Save the current layout as</span>
        <input bind:value={saveName} placeholder="my-setup" maxlength="32" spellcheck="false" />
        <button type="submit" disabled={!saveName.trim()}>save</button>
      </form>
      <p class="keys">arrows to move · enter to apply · esc to close · alt+t to open again</p>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 90;
    display: grid;
    place-items: center;
    padding: 16px;
    background: color-mix(in srgb, var(--bg1) 55%, rgba(0, 0, 0, 0.6));
    backdrop-filter: blur(6px);
    animation: fade 0.15s ease-out;
  }
  .dialog {
    width: min(980px, 100%);
    max-height: calc(100dvh - 32px);
    overflow: auto;
    padding: 20px;
    border-radius: 12px;
    border: 1px solid var(--bg2);
    background: var(--bg1);
    color: var(--t2);
    box-shadow: 0 30px 80px -20px rgba(0, 0, 0, 0.7);
    animation: pop 0.18s ease-out;
  }
  .head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
  }
  h2 {
    font-size: 18px;
    color: var(--hl1);
    margin-bottom: 2px;
  }
  .head p {
    color: var(--t1);
    font-size: 13px;
  }
  .x {
    align-self: flex-start;
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;
    border: 1px solid var(--bg2);
    color: var(--t1);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: 12px;
  }
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    text-align: left;
    border-radius: 10px;
    border: 1px solid var(--bg2);
    padding: 10px;
    gap: 10px;
    color: inherit;
    outline: none;
    transition: border-color 0.12s, transform 0.12s;
  }
  .card:hover,
  .card.selected {
    border-color: var(--hl1);
    transform: translateY(-2px);
  }
  .card.selected {
    box-shadow: 0 0 0 1px var(--hl1);
  }
  .preview {
    display: flex;
    height: 110px;
    padding: 6px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--bg2) 30%, var(--bg1));
  }
  .meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .name {
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .tag {
    font-size: 10px;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--hl1);
    color: var(--bg1);
  }
  .desc {
    font-size: 12px;
    color: var(--t1);
  }
  .del {
    position: absolute;
    top: 6px;
    right: 8px;
    font-size: 10px;
    color: var(--t1);
    padding: 1px 6px;
    border-radius: 4px;
    background: var(--bg1);
  }
  .del:hover {
    color: #fff;
    background: #e5484d;
  }
  .save {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: 18px;
    font-size: 13px;
  }
  .label {
    color: var(--t1);
  }
  .save input {
    flex: 1;
    min-width: 140px;
    padding: 4px 8px;
    border-radius: 6px;
    border: 1px solid var(--bg2);
    background: transparent;
    color: var(--t2);
    font: inherit;
    outline: none;
  }
  .save input:focus {
    border-color: var(--hl1);
  }
  .save button {
    padding: 4px 12px;
    border-radius: 6px;
    background: var(--hl1);
    color: var(--bg1);
  }
  .save button:disabled {
    opacity: 0.4;
  }
  .keys {
    margin-top: 10px;
    font-size: 11px;
    color: var(--t1);
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  @keyframes pop {
    from {
      transform: translateY(8px) scale(0.98);
      opacity: 0;
    }
  }
</style>
