<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import type { Config } from '../../core/types';
  import { asItem, fetchTitle, itemKey, labelOf, playKey, resolveInput, type MediaItem, type MediaSource, type Preset } from './media';
  import PresetMenu from './PresetMenu.svelte';
  import { recentFor, recordPlay } from './recent';

  /**
   * Generic iframe player behind the youtube, ytmusic and spotify widgets:
   * a thin bar (presets/recent menu, URL input, reload, open) above an
   * embedded player that gets the rest of the pane.
   */
  export let focused = false;
  export let config: Config = {};
  export let updateConfig: (patch: Config) => void = () => {};
  export let source: MediaSource;
  export let presets: Preset[];
  /** Played when the pane has no item of its own. */
  export let fallback: MediaItem;
  /** Height for the iframe given the room available; null fills the pane. */
  export let fit: ((available: number) => number) | null = null;
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
  let stageH = 0;
  let draft = '';
  let error = '';
  let menuOpen = false;
  let menuTab: 'presets' | 'recent' = 'presets';
  let frameKey = 0;

  $: item = asItem(config.item === undefined ? fallback : config.item, source);
  $: recentItems = $recent.map((r) => asItem(r, source)).filter((r): r is MediaItem => !!r);
  // Icon-only bar in narrow or short panes; the hint only when there is room to spare.
  $: compact = (w > 0 && w < 420) || (h > 0 && h < 220);
  $: showHint = !!hint && !compact && h >= 360;

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

  // the fitted stage has 6px of padding on each side
  $: frameHeight = fit && stageH ? fit(Math.max(0, stageH - 12)) : 0;

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

  function closeMenu(refocus = true) {
    menuOpen = false;
    if (refocus) tick().then(() => toggle?.focus({ preventScroll: true }));
  }

  /* --------------------------------------------------------- keyboard */

  function onKey(e: KeyboardEvent) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const target = e.target as HTMLElement;
    if (target === input) {
      if (e.key === 'Escape') {
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
      menuOpen = !menuOpen;
    } else if (e.code === 'KeyR') {
      e.preventDefault();
      reload();
    } else if (e.key === 'Escape' && error) error = '';
  }

  /** Clicking into the player moves focus to the iframe: close the menu then. */
  function onFocusIn(e: FocusEvent) {
    if ((e.target as HTMLElement).tagName === 'IFRAME') menuOpen = false;
  }

  function clickOutside(node: HTMLElement) {
    const handler = (e: PointerEvent) => {
      if (!node.contains(e.target as Node) && !toggle?.contains(e.target as Node)) menuOpen = false;
    };
    document.addEventListener('pointerdown', handler, true);
    return { destroy: () => document.removeEventListener('pointerdown', handler, true) };
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
      on:click={() => (menuOpen = !menuOpen)}
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

  {#if menuOpen}
    <div class="menu-wrap" use:clickOutside>
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

  <div class="stage" class:fitted={!!fit} bind:clientHeight={stageH}>
    {#if item && src}
      {#key frameKey}
        <iframe
          {src}
          title="{source.name}: {labelOf(item)}"
          style={frameHeight ? `height:${frameHeight}px` : ''}
          loading="lazy"
          referrerpolicy="strict-origin-when-cross-origin"
          allow="autoplay; encrypted-media; picture-in-picture; clipboard-write; fullscreen"
          allowfullscreen
        />
      {/key}
    {:else}
      <div class="empty">
        <p>Nothing to play here.</p>
        <p class="muted">Paste a link above or pick a preset.</p>
        <button type="button" class="empty-btn" on:click={() => (menuOpen = true)}>show presets</button>
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
    background: color-mix(in srgb, var(--hl1) 8%, transparent);
  }
  .hint {
    color: var(--t1);
  }
  .menu-wrap {
    position: absolute;
    z-index: 5;
    top: 33px;
    left: 6px;
    bottom: 6px;
    width: min(340px, calc(100% - 12px));
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    pointer-events: none;
  }
  .compact .menu-wrap {
    top: 31px;
    left: 4px;
    bottom: 4px;
    width: calc(100% - 8px);
    max-width: 340px;
  }
  .menu-wrap > :global(*) {
    pointer-events: auto;
  }
  .stage {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    background: color-mix(in srgb, var(--bg2) 22%, var(--bg1));
  }
  .stage.fitted {
    align-items: center;
    padding: 6px;
    background: transparent;
  }
  iframe {
    flex: 1;
    display: block;
    width: 100%;
    height: 100%;
    min-height: 0;
    border: 0;
  }
  .fitted iframe {
    flex: 0 0 auto;
    border-radius: 12px;
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
    .menu-wrap,
    .compact .menu-wrap {
      top: 43px;
      left: 6px;
      bottom: 6px;
      width: calc(100% - 12px);
      max-width: none;
    }
    .empty-btn {
      min-height: 36px;
    }
  }
</style>
