<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import type { Config } from '../../core/types';
  import { asItem, fetchTitle, itemKey, labelOf, playKey, resolveInput, type MediaItem, type MediaSource, type Preset } from './media';
  import PresetMenu from './PresetMenu.svelte';
  import { recentFor, recordPlay } from './recent';

  /**
   * Generic iframe player behind the youtube, ytmusic and spotify widgets:
   * a thin bar (presets/recent menu, URL input, reload, open) above an
   * embedded player that gets the rest of the pane. The bar drops to icons
   * in small panes and floats over the player in short ones; the menu
   * floats in the viewport so it never gets squeezed by the pane.
   */
  export let focused = false;
  export let config: Config = {};
  export let updateConfig: (patch: Config) => void = () => {};
  export let source: MediaSource;
  export let presets: Preset[];
  /** Played when the pane has no item of its own. */
  export let fallback: MediaItem;
  /** Iframe height for the stage's width and height (it is centred in it); null fills the stage. */
  export let fit: ((width: number, height: number) => number) | null = null;
  /** Small print in the menu, e.g. how it plays. */
  export let note = '';
  /** Short hint under the bar in roomy panes. */
  export let hint = '';

  const recent = recentFor(source.widget);

  let root: HTMLDivElement;
  let input: HTMLInputElement;
  let toggle: HTMLButtonElement;
  let w = 0;
  let h = 0;
  let stageW = 0;
  let stageH = 0;
  let draft = '';
  let error = '';
  let menuOpen = false;
  let menuTab: 'presets' | 'recent' = 'presets';
  let menuStyle = '';
  let frameKey = 0;
  let touchSized = false;

  $: item = asItem(config.item === undefined ? fallback : config.item, source);
  $: currentKey = item ? itemKey(item) : '';
  $: recentItems = $recent.map((r) => asItem(r, source)).filter((r): r is MediaItem => !!r);
  // Icon-only bar in narrow or short panes; the hint only when there is room to spare.
  $: compact = (w > 0 && w < 420) || (h > 0 && h < 220);
  // Short panes: the bar floats over the player and shows on hover or keyboard
  // focus, so the player gets the whole pane (touch screens keep it in place).
  $: tiny = h > 0 && h < 190;
  $: showHint = !!hint && !compact && h >= 360;

  // Mirrors the media query that gives controls touch-sized heights below.
  onMount(() => {
    const query = matchMedia('(max-width: 720px), (pointer: coarse)');
    const sync = () => (touchSized = query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  });

  /* ------------------------------------------------------------ iframe */

  // The src only changes when what plays changes, never for a new title,
  // so a late oEmbed title (or a theme change) does not restart playback.
  let src = '';
  let srcKey = '';
  $: syncSrc(item);
  function syncSrc(next: MediaItem | null) {
    const key = next ? playKey(next) : '';
    if (key === srcKey) return;
    srcKey = key;
    src = next ? source.embedUrl(next) : '';
  }

  function reload() {
    if (!item) return;
    src = source.embedUrl(item);
    frameKey++;
  }

  /* -------------------------------------------- fitted players (Spotify) */

  // Matches the fitted stage's CSS: side padding, gap under the player, gap between chips.
  const EDGE = 6;
  const FRAME_GAP = 10;
  const CHIP_GAP = 6;
  $: frameHeight = fit && stageH ? fit(stageW - 2 * EDGE, stageH) : 0;
  // Room left under a fitted player holds up to three rows of quick preset chips.
  $: chipPitch = (touchSized ? 32 : 24) + CHIP_GAP;
  $: chipRows = frameHeight ? Math.min(3, Math.floor((stageH - frameHeight - 2 * EDGE - FRAME_GAP + CHIP_GAP) / chipPitch)) : 0;

  /** A single row of chips scrolls sideways: let a plain mouse wheel do that. */
  function scrollChips(e: WheelEvent) {
    const row = e.currentTarget as HTMLElement;
    if (chipRows !== 1 || Math.abs(e.deltaX) >= Math.abs(e.deltaY) || row.scrollWidth <= row.clientWidth) return;
    e.preventDefault();
    row.scrollLeft += e.deltaY;
  }

  /* ------------------------------------------------------------- title */

  let titleCtl: AbortController | null = null;
  let titleFor = '';
  $: if (item && !item.title) loadTitle(item);

  async function loadTitle(target: MediaItem) {
    const key = itemKey(target);
    if (key === titleFor) return;
    titleFor = key;
    titleCtl?.abort();
    titleCtl = new AbortController();
    try {
      const title = await fetchTitle(source, target, titleCtl.signal);
      recent.retitle(target, title);
      if (item && itemKey(item) === key && !item.title) updateConfig({ item: { ...item, title } });
    } catch {
      /* offline, private or removed: the id stays as the label */
    }
  }

  onDestroy(() => titleCtl?.abort());

  /* -------------------------------------------------------------- play */

  function play(next: MediaItem) {
    error = '';
    menuOpen = false;
    updateConfig({ item: recordPlay(source.widget, presets, next) });
  }

  function submit() {
    const text = draft.trim();
    if (!text) return;
    const next = resolveInput(text, source, presets);
    if (!next) {
      error = source.invalidHint;
      return;
    }
    draft = '';
    play(next);
    root?.focus({ preventScroll: true });
  }

  function pick(next: MediaItem) {
    play(next);
    tick().then(() => toggle?.focus({ preventScroll: true }));
  }

  /* -------------------------------------------------------------- menu */

  /**
   * The menu floats in the viewport under its button (or above it when there
   * is more room there), so it is usable even in a tiny pane.
   */
  function placeMenu() {
    if (!toggle) return;
    const r = toggle.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(340, vw - 16);
    const left = Math.max(8, Math.min(r.left, vw - width - 8));
    const below = vh - r.bottom - 12;
    const above = r.top - 12;
    const down = below >= 280 || below >= above;
    const edge = down ? `top:${Math.round(r.bottom + 4)}px` : `bottom:${Math.round(vh - r.top + 4)}px`;
    menuStyle = `left:${Math.round(left)}px;width:${width}px;max-height:${Math.round(Math.min(460, down ? below : above))}px;${edge}`;
  }

  function openMenu() {
    placeMenu();
    menuOpen = true;
  }

  function toggleMenu() {
    if (menuOpen) menuOpen = false;
    else openMenu();
  }

  function closeMenu(refocus = true) {
    menuOpen = false;
    if (refocus) tick().then(() => toggle?.focus({ preventScroll: true }));
  }

  // Follow the button when the pane is resized; close when the pane loses focus.
  $: if (menuOpen && w && h) placeMenu();
  $: if (!focused && menuOpen) menuOpen = false;

  /**
   * Close on clicks outside, and when something around the player scrolls
   * (the page on phones). Scrolling the menu's own list or another pane is fine.
   */
  function floating(node: HTMLElement) {
    const onPointer = (e: PointerEvent) => {
      if (!node.contains(e.target as Node) && !toggle?.contains(e.target as Node)) menuOpen = false;
    };
    const onScroll = (e: Event) => {
      const target = e.target;
      if (target instanceof Node && !node.contains(target) && target.contains(root)) menuOpen = false;
    };
    document.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', placeMenu);
    return {
      destroy() {
        document.removeEventListener('pointerdown', onPointer, true);
        window.removeEventListener('scroll', onScroll, true);
        window.removeEventListener('resize', placeMenu);
      },
    };
  }

  /* --------------------------------------------------------- keyboard */

  function onKey(e: KeyboardEvent) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const target = e.target as HTMLElement;
    if (target === input) {
      if (e.code === 'Escape') {
        e.preventDefault();
        draft = '';
        error = '';
        root.focus({ preventScroll: true });
      }
      return;
    }
    if (target !== root) return;
    if (e.code === 'Slash') {
      e.preventDefault();
      input?.focus();
    } else if (e.code === 'KeyP') {
      e.preventDefault();
      toggleMenu();
    } else if (e.code === 'KeyR') {
      e.preventDefault();
      reload();
    } else if (e.code === 'Escape' && error) error = '';
  }

  /** Clicking into the player moves focus to the iframe: close the menu then. */
  function onFocusIn(e: FocusEvent) {
    if ((e.target as HTMLElement).tagName === 'IFRAME') menuOpen = false;
  }

  // Focus the player root when the pane gains focus, unless focus is already
  // inside (the iframe or the input), so clicks into the player keep working.
  let wasFocused = false;
  $: {
    if (focused && !wasFocused) {
      tick().then(() => {
        if (root && !root.contains(document.activeElement)) root.focus({ preventScroll: true });
      });
    }
    wasFocused = focused;
  }
</script>

<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
<div
  class="player"
  class:compact
  class:tiny
  bind:this={root}
  bind:clientWidth={w}
  bind:clientHeight={h}
  tabindex="0"
  role="region"
  aria-label="{source.name} player"
  data-widget-player={source.widget}
  on:keydown={onKey}
  on:focusin={onFocusIn}
>
  <!-- The pointer over a cross-origin iframe is invisible to this page, so a
       short pane reveals its floating bar from a strip along the top edge. -->
  {#if tiny}<div class="reveal-zone" aria-hidden="true"><span class="grip" /></div>{/if}
  <div class="chrome" class:pinned={menuOpen || !!error}>
    <form class="bar" on:submit|preventDefault={submit}>
      <button
        type="button"
        class="menu-toggle"
        class:on={menuOpen}
        bind:this={toggle}
        title="Presets and recent (p)"
        aria-label="Presets and recent"
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        on:click={toggleMenu}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4h11M2.5 8h11M2.5 12h7" /></svg>
        {#if !compact}<span>presets</span>{/if}
      </button>
      <input
        bind:this={input}
        bind:value={draft}
        on:input={() => (error = '')}
        class:invalid={!!error}
        type="text"
        inputmode="url"
        enterkeyhint="go"
        placeholder={compact ? source.shortPlaceholder : source.placeholder}
        aria-label="{source.name} link"
        aria-invalid={!!error}
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
      />
      {#if item}
        {#if !compact}
          <button type="button" class="icon-btn" title="Reload the player (r)" aria-label="Reload the player" on:click={reload}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5v2.8h-2.8" /></svg>
          </button>
        {/if}
        <a class="icon-btn" href={source.pageUrl(item)} target="_blank" rel="noopener noreferrer" title="Open on {source.name}" aria-label="Open on {source.name}">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3" /></svg>
        </a>
      {/if}
    </form>

    {#if error}
      <p class="error" role="alert">{error}</p>
    {:else if showHint}
      <p class="hint">{hint}</p>
    {/if}
  </div>

  {#if menuOpen}
    <div class="menu-wrap" style={menuStyle} use:floating>
      <PresetMenu
        {presets}
        recent={recentItems}
        current={item}
        {note}
        bind:tab={menuTab}
        on:pick={(e) => pick(e.detail)}
        on:forget={(e) => recent.forget(e.detail)}
        on:clear={() => recent.clear()}
        on:close={() => closeMenu()}
      />
    </div>
  {/if}

  <div class="stage" class:fitted={!!fit} bind:clientWidth={stageW} bind:clientHeight={stageH}>
    {#if item && src}
      {#key frameKey}
        <iframe
          {src}
          title="{source.name}: {labelOf(item)}"
          style={frameHeight ? `height:${frameHeight}px` : ''}
          loading="lazy"
          referrerpolicy="strict-origin-when-cross-origin"
          allow="autoplay; encrypted-media; picture-in-picture; clipboard-write; fullscreen"
        />
      {/key}
      {#if chipRows > 0}
        <div
          class="chips"
          class:single={chipRows === 1}
          style="max-height:{chipRows * chipPitch - CHIP_GAP}px"
          role="group"
          aria-label="Quick presets"
          on:wheel={scrollChips}
        >
          {#each presets as p (p.slug)}
            {@const on = itemKey(p.item) === currentKey}
            <button type="button" class="chip" class:on aria-pressed={on} title={p.note} on:click={() => play(p.item)}>{p.name}</button>
          {/each}
        </div>
      {/if}
    {:else}
      <div class="empty">
        <p>Nothing to play here.</p>
        <p class="muted">Paste a link above or pick a preset.</p>
        <button type="button" class="empty-btn" on:click={openMenu}>show presets</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .player {
    position: relative;
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    color: var(--t2);
    font-size: 12px;
    outline: none;
  }
  .player :global(*:focus:not(:focus-visible)) {
    outline: none;
  }
  .chrome {
    flex: 0 0 auto;
    background: var(--bg1);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 0;
    padding: 4px 6px;
    border-bottom: 1px solid color-mix(in srgb, var(--bg2) 70%, transparent);
  }
  .compact .bar {
    padding: 3px 4px;
    gap: 3px;
  }
  .bar input {
    flex: 1;
    min-width: 0;
    height: 24px;
    padding: 0 8px;
    border-radius: 6px;
    border: 1px solid color-mix(in srgb, var(--bg2) 85%, transparent);
    background: color-mix(in srgb, var(--bg2) 18%, var(--bg1));
    color: var(--t2);
    font: inherit;
    font-size: 12px;
    outline: none;
  }
  .bar input::placeholder {
    color: var(--t1);
    opacity: 0.8;
  }
  .bar input:focus {
    border-color: var(--hl1);
    background: var(--bg1);
  }
  .bar input.invalid {
    border-color: color-mix(in srgb, var(--hl1) 70%, var(--t1));
  }
  .menu-toggle,
  .icon-btn {
    flex: 0 0 auto;
    height: 24px;
    min-width: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    border-radius: 6px;
    color: var(--t1);
    text-decoration: none;
  }
  .menu-toggle {
    padding: 0 6px;
    border: 1px solid color-mix(in srgb, var(--bg2) 85%, transparent);
    font-size: 11px;
  }
  .compact .menu-toggle {
    padding: 0;
    width: 24px;
  }
  .menu-toggle:hover,
  .menu-toggle.on,
  .icon-btn:hover {
    color: var(--hl1);
    border-color: var(--hl1);
  }
  .icon-btn:hover {
    background: color-mix(in srgb, var(--bg2) 60%, transparent);
  }
  svg {
    width: 14px;
    height: 14px;
    flex: 0 0 auto;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .error,
  .hint {
    margin: 0;
    padding: 4px 8px;
    font-size: 11px;
    line-height: 1.35;
    border-bottom: 1px dashed color-mix(in srgb, var(--bg2) 80%, transparent);
  }
  .error {
    color: var(--hl1);
    background: color-mix(in srgb, var(--hl1) 8%, var(--bg1));
  }
  .hint {
    color: var(--t1);
  }
  .menu-wrap {
    position: fixed;
    z-index: 45;
    display: flex;
    flex-direction: column;
  }
  .stage {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    background: color-mix(in srgb, var(--bg2) 22%, var(--bg1));
  }
  .stage.fitted {
    flex-direction: column;
    align-items: stretch;
    justify-content: center;
    gap: 10px;
    padding: 0 6px;
    background: transparent;
  }
  /* Stretched by the stage rather than height: 100%, which needs a definite
     pane height (a stacked pane on a phone only has a min-height). */
  iframe {
    flex: 1;
    display: block;
    width: 100%;
    min-height: 0;
    border: 0;
  }
  .fitted iframe {
    flex: 0 0 auto;
    border-radius: 12px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
    overflow-y: auto;
    scrollbar-width: none;
  }
  .chips.single {
    flex-wrap: nowrap;
    justify-content: flex-start;
    overflow: auto hidden;
    -webkit-mask-image: linear-gradient(90deg, transparent, #000 14px, #000 calc(100% - 14px), transparent);
    mask-image: linear-gradient(90deg, transparent, #000 14px, #000 calc(100% - 14px), transparent);
  }
  .single .chip {
    flex: 0 0 auto;
  }
  /* centred while the row fits, scrollable from its first chip once it does not */
  .single .chip:first-child {
    margin-left: auto;
  }
  .single .chip:last-child {
    margin-right: auto;
  }
  .chip {
    height: 24px;
    max-width: 100%;
    padding: 0 10px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--bg2) 85%, transparent);
    color: var(--t1);
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .chip:hover {
    color: var(--hl1);
    border-color: var(--hl1);
  }
  .chip.on {
    color: var(--hl1);
    border-color: color-mix(in srgb, var(--hl1) 60%, transparent);
    background: color-mix(in srgb, var(--hl1) 12%, transparent);
  }
  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 12px;
    text-align: center;
  }
  .empty p {
    margin: 0;
  }
  .muted {
    color: var(--t1);
  }
  .empty-btn {
    margin-top: 4px;
    padding: 4px 12px;
    border-radius: 6px;
    border: 1px solid var(--hl1);
    color: var(--hl1);
    font-size: 12px;
  }
  .reveal-zone {
    display: none;
  }
  /* Short panes with a mouse: the bar floats over the top of the player and
     shows while the pointer is on the top strip or the bar, or a control has
     keyboard focus. */
  @media (hover: hover) {
    .tiny .reveal-zone {
      position: absolute;
      z-index: 2;
      top: 0;
      left: 0;
      right: 0;
      height: 14px;
      display: flex;
      justify-content: center;
      background: linear-gradient(color-mix(in srgb, var(--bg1) 55%, transparent), transparent);
    }
    .grip {
      width: 28px;
      height: 3px;
      margin-top: 4px;
      border-radius: 2px;
      background: color-mix(in srgb, var(--t1) 75%, transparent);
    }
    .tiny .chrome {
      position: absolute;
      z-index: 3;
      top: 0;
      left: 0;
      right: 0;
      background: color-mix(in srgb, var(--bg1) 94%, transparent);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s ease 0.4s;
    }
    .tiny:hover .chrome,
    .tiny:focus-visible .chrome,
    .tiny .chrome:focus-within,
    .tiny .chrome.pinned {
      opacity: 1;
      pointer-events: auto;
      transition-delay: 0s;
    }
  }
  @media (max-width: 720px), (pointer: coarse) {
    .bar,
    .compact .bar {
      padding: 4px 6px;
      gap: 6px;
    }
    .bar input {
      height: 34px;
      font-size: 16px;
    }
    .menu-toggle,
    .icon-btn,
    .compact .menu-toggle {
      height: 34px;
      min-width: 34px;
    }
    .chip {
      height: 32px;
      padding: 0 14px;
      font-size: 12px;
    }
    .empty-btn {
      min-height: 36px;
    }
  }
  /* Stacked panes on phones: never shrink the player below a 16:9 frame of
     the screen width (or the 72vh pane minus its header and bar). */
  @media (max-width: 720px) {
    .stage {
      min-height: min(56.25vw, calc(72vh - 80px));
    }
  }
</style>
