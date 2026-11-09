<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { focusPane, leaves, workspace } from '../core/workspace';
  import PaneFrame from './PaneFrame.svelte';

  /**
   * The phone layout: every pane of the tab is one full-width page in a
   * sideways strip. Swipe to move between panes (native snap scrolling), and
   * each pane scrolls its own content up and down.
   *
   * The strip and the focused pane stay in step both ways: swiping focuses the
   * pane you land on, and focusing a pane (the dock, a command, opening a
   * widget) slides to it.
   */

  let deck: HTMLDivElement;
  $: panes = leaves($workspace.root);
  $: focused = $workspace.focused;

  /** The pane the strip is showing, to tell our own focus changes from outside ones. */
  let shown: string | null = null;
  let settle: ReturnType<typeof setTimeout> | undefined;

  function indexOf(id: string | null): number {
    return Math.max(0, panes.findIndex((p) => p.id === id));
  }

  function slideTo(id: string | null, smooth: boolean) {
    if (!deck) return;
    const left = indexOf(id) * deck.clientWidth;
    if (Math.abs(deck.scrollLeft - left) < 2) return;
    deck.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
  }

  // Focus moved from outside (dock, command, a new pane): slide there.
  $: if (deck && focused && focused !== shown) {
    shown = focused;
    void tick().then(() => slideTo(focused, true));
  }

  // Panes were added or removed: stay on the pane being shown (no animation).
  $: ids = panes.map((p) => p.id).join(',');
  $: ids, keepPlace();
  function keepPlace() {
    if (deck) void tick().then(() => slideTo(shown, false));
  }

  /** After a swipe comes to rest, focus the pane it landed on. */
  function onScroll() {
    if (settle) clearTimeout(settle);
    settle = setTimeout(() => {
      if (!deck || !deck.clientWidth) return;
      const pane = panes[Math.round(deck.scrollLeft / deck.clientWidth)];
      if (!pane || pane.id === shown) return;
      shown = pane.id;
      focusPane(pane.id);
    }, 90);
  }

  onMount(() => {
    shown = focused ?? panes[0]?.id ?? null;
    slideTo(shown, false);
    // turning the phone changes the page width: stay on the same pane
    const onResize = () => slideTo(shown, false);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (settle) clearTimeout(settle);
    };
  });
</script>

<div class="deck" bind:this={deck} on:scroll={onScroll}>
  {#each panes as p (p.id)}
    <div class="page" data-page={p.id}>
      <PaneFrame pane={p} />
    </div>
  {/each}
</div>

<style>
  .deck {
    display: flex;
    width: 100%;
    height: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-type: x mandatory;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }
  .deck::-webkit-scrollbar {
    display: none;
  }
  .page {
    flex: 0 0 100%;
    width: 100%;
    height: 100%;
    min-width: 0;
    display: flex;
    padding: 4px;
    scroll-snap-align: start;
    scroll-snap-stop: always;
  }
</style>
