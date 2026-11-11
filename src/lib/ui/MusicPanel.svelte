<script lang="ts">
  import { tick } from 'svelte';
  import { musicSource, useSource, type MusicSource } from '../core/music';
  import { openWidget } from '../core/workspace';
  import Radio from '../widgets/radio/Radio.svelte';
  import Spotify from '../widgets/spotify/Spotify.svelte';

  /**
   * Opened from the player's name in the status bar, like the calendar opens
   * from the clock: the full controls of both music players, with a switch
   * between them. Closes on Escape or an outside click.
   */
  export let open = false;

  let root: HTMLDivElement;
  let tab: MusicSource = 'radio';
  let style = '';

  let wasOpen = false;
  $: if (open !== wasOpen) {
    wasOpen = open;
    if (open) onOpen();
  }

  function onOpen() {
    tab = $musicSource;
    place();
    void tick().then(() => root?.focus({ preventScroll: true }));
  }

  /** Above the status bar, lined up with the button that opened it. */
  function place() {
    const r = document.querySelector('[data-music-toggle]')?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(340, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.right - width + 60, window.innerWidth - width - 8));
    const room = r.top - 14;
    style = `left:${Math.round(left)}px;width:${width}px;bottom:${Math.round(window.innerHeight - r.top + 6)}px;height:${Math.round(Math.min(520, room))}px`;
  }

  function choose(next: MusicSource) {
    tab = next;
    useSource(next);
  }

  function openPane() {
    open = false;
    openWidget(tab);
  }

  function onWindowDown(e: PointerEvent) {
    if (!open) return;
    const target = e.target as HTMLElement;
    // the status bar buttons toggle the panel themselves
    if (root && !root.contains(target) && !target.closest?.('[data-music-toggle], [data-music-keep]')) open = false;
  }
  function onWindowKey(e: KeyboardEvent) {
    if (open && e.key === 'Escape') open = false;
  }
</script>

<svelte:window on:pointerdown|capture={onWindowDown} on:keydown={onWindowKey} on:resize={() => open && place()} />

{#if open}
  <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
  <div class="panel" bind:this={root} {style} role="dialog" aria-label="Music" tabindex="-1" data-music-panel>
    <div class="head">
      <div class="switch" role="tablist" aria-label="Music source">
        <button role="tab" class:on={tab === 'radio'} aria-selected={tab === 'radio'} on:click={() => choose('radio')}>Radio</button>
        <button role="tab" class:on={tab === 'spotify'} aria-selected={tab === 'spotify'} on:click={() => choose('spotify')}>Spotify</button>
      </div>
      <button class="pane" on:click={openPane} title="Open the {tab === 'radio' ? 'Radio' : 'Spotify'} pane">open as a pane</button>
    </div>
    <div class="body">
      {#if tab === 'radio'}
        <Radio panel />
      {:else}
        <Spotify panel />
      {/if}
    </div>
  </div>
{/if}

<style>
  .panel {
    position: fixed;
    z-index: 60;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px;
    border-radius: 10px;
    border: 1px solid var(--bg2);
    background: var(--bg1);
    box-shadow: 0 16px 40px -12px rgba(0, 0, 0, 0.6);
    color: var(--t2);
    font-size: 12px;
    /* the status bar it opens from never wraps or selects */
    white-space: normal;
    user-select: text;
    outline: none;
  }
  .head {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .switch {
    display: flex;
    border: 1px solid var(--bg2);
    border-radius: 8px;
    overflow: hidden;
  }
  .switch button {
    padding: 5px 14px;
    color: var(--t1);
    font-size: 12px;
  }
  .switch button:hover {
    color: var(--t2);
  }
  .switch button.on {
    background: var(--hl1);
    color: var(--bg1);
    font-weight: 600;
  }
  .pane {
    padding: 4px 8px;
    border-radius: 6px;
    color: var(--t1);
    font-size: 11px;
  }
  .pane:hover {
    color: var(--hl1);
    background: color-mix(in srgb, var(--bg2) 50%, transparent);
  }
  .body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .body :global(.music) {
    flex: 1;
    height: auto;
  }
  :focus-visible {
    outline: 1px solid var(--hl1);
    outline-offset: 2px;
  }
  @media (max-width: 720px), (pointer: coarse) {
    .switch button {
      padding: 8px 16px;
    }
  }
</style>
