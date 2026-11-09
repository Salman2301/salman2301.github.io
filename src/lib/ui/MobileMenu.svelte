<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { widgets } from '../core/registry';
  import { startScreensaver } from '../core/screensaver';
  import { cycleThemeHere } from '../core/spaces';
  import { cycleThemeMode, themeMode, themeStore } from '../core/theme';
  import { openOverlay, templatePickerOpen } from '../core/ui';
  import { canClosePane, closePane, leaf, leaves, newTab, openWidget, splitPane, workspace } from '../core/workspace';
  import { runInTerminal } from '../terminal/context';
  import { radioState, stepStation, toggleRadio } from '../widgets/radio/player';

  /**
   * The phone menu (the + in the dock): open any widget, and the actions that
   * are Alt shortcuts on a computer, as big buttons. A bottom sheet: tap
   * outside or swipe it down to close.
   */
  export let open = false;

  const close = () => (open = false);

  function pick(fn: () => void) {
    close();
    fn();
  }

  $: focused = $workspace.focused ?? leaves($workspace.root)[0]?.id;
  $: playing = $radioState.status === 'playing' || $radioState.status === 'connecting';

  interface Action {
    label: string;
    hint?: string;
    run: () => void;
    disabled?: boolean;
  }
  let groups: { title: string; items: Action[] }[] = [];
  $: groups = [
    {
      title: 'Workspace',
      items: [
        { label: 'Search', hint: 'tasks, notes, commands', run: () => openOverlay.set('search') },
        { label: 'Templates', hint: 'ready-made layouts', run: () => templatePickerOpen.set(true) },
        { label: 'New terminal', hint: 'another pane', run: () => focused && splitPane(focused, 'row', leaf('terminal')) },
        { label: 'Close this pane', run: () => focused && closePane(focused), disabled: !canClosePane($workspace) },
        { label: 'New tab', run: () => void newTab() },
        { label: 'Shortcuts', hint: 'every key and gesture', run: () => openOverlay.set('keys') },
      ],
    },
    {
      title: 'Look and sound',
      items: [
        { label: 'Next theme', hint: $themeStore, run: () => void cycleThemeHere(false) },
        { label: 'Random theme', run: () => void cycleThemeHere(true) },
        { label: `Mode: ${$themeMode}`, hint: 'system, dark, light', run: cycleThemeMode },
        { label: playing ? 'Pause radio' : 'Play radio', hint: $radioState.station.name, run: toggleRadio },
        { label: 'Next station', run: () => void stepStation(1) },
        { label: 'Screensaver', run: () => startScreensaver() },
      ],
    },
    {
      title: 'App',
      items: [
        { label: 'Install as an app', run: () => void runInTerminal('install') },
        { label: 'Back up my data', run: () => void runInTerminal('backup') },
        { label: 'All commands', run: () => void runInTerminal('help') },
        { label: 'Report a problem', run: () => void runInTerminal('issue') },
      ],
    },
  ];

  // The theme and radio buttons keep the sheet open, so you can tap them again.
  const STAY = new Set(['Next theme', 'Random theme', 'Next station']);

  /* swipe the sheet down to close */
  let startY = 0;
  let dragY = 0;
  let dragging = false;
  function onDown(e: PointerEvent) {
    dragging = true;
    startY = e.clientY;
    dragY = 0;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onMove(e: PointerEvent) {
    if (dragging) dragY = Math.max(0, e.clientY - startY);
  }
  function onUp() {
    if (!dragging) return;
    dragging = false;
    if (dragY > 70) close();
    dragY = 0;
  }

  function onKey(e: KeyboardEvent) {
    if (open && e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }
</script>

<svelte:window on:keydown={onKey} />

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="backdrop" transition:fade={{ duration: 140 }} on:click|self={close}>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Open a widget, and more" transition:fly={{ y: 300, duration: 200 }} style="transform: translateY({dragY}px)">
      <div class="grab" on:pointerdown={onDown} on:pointermove={onMove} on:pointerup={onUp} on:pointercancel={onUp}>
        <span class="bar" />
      </div>
      <div class="scroll">
        <h3>Open</h3>
        <div class="grid">
          {#each widgets.filter((w) => !w.hidden) as w (w.id)}
            <button class="tile" on:click={() => pick(() => void openWidget(w.id))}>
              <span class="icon" aria-hidden="true">{w.icon}</span>
              <span class="tname">{w.title}</span>
            </button>
          {/each}
        </div>
        {#each groups as g (g.title)}
          <h3>{g.title}</h3>
          <div class="list">
            {#each g.items as a (a.label)}
              <button class="row" disabled={a.disabled} on:click={() => (STAY.has(a.label) ? a.run() : pick(a.run))}>
                <span>{a.label}</span>
                {#if a.hint}<span class="hint">{a.hint}</span>{/if}
              </button>
            {/each}
          </div>
        {/each}
        <p class="tip">Swipe left or right to move between panes.</p>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 140;
    display: flex;
    align-items: flex-end;
    background: color-mix(in srgb, var(--bg1) 55%, transparent);
    backdrop-filter: blur(2px);
  }
  .sheet {
    width: 100%;
    max-height: min(82%, 640px);
    display: flex;
    flex-direction: column;
    border: 1px solid var(--bg2);
    border-bottom: 0;
    border-radius: 16px 16px 0 0;
    background: var(--bg1);
    color: var(--t2);
    font-size: 14px;
    box-shadow: 0 -20px 50px -20px color-mix(in srgb, var(--bg2) 80%, transparent);
  }
  .grab {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    height: 26px;
    touch-action: none;
    cursor: grab;
  }
  .bar {
    width: 40px;
    height: 4px;
    border-radius: 2px;
    background: var(--bg2);
  }
  .scroll {
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 14px calc(14px + env(safe-area-inset-bottom));
  }
  h3 {
    margin: 10px 0 8px;
    color: var(--hl1);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
    gap: 8px;
  }
  .tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 64px;
    padding: 8px 4px;
    border: 1px solid var(--bg2);
    border-radius: 12px;
    color: var(--t2);
  }
  .tile:active,
  .row:active {
    border-color: var(--hl1);
    color: var(--hl1);
  }
  .icon {
    color: var(--hl1);
    font-size: 18px;
    line-height: 1;
  }
  .tname {
    font-size: 12px;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    white-space: nowrap;
  }
  .list {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .row {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    min-height: 48px;
    padding: 8px 12px;
    border: 1px solid var(--bg2);
    border-radius: 12px;
    color: var(--t2);
    text-align: left;
  }
  .row:disabled {
    opacity: 0.4;
  }
  .hint {
    color: var(--t1);
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }
  .tip {
    margin: 14px 0 0;
    color: var(--t1);
    font-size: 12px;
    text-align: center;
  }
</style>
