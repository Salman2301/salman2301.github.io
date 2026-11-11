<script lang="ts">
  import { onMount } from 'svelte';
  import type { Config } from '../../core/types';
  import { asItem, findPreset, itemKey, labelOf, resolveInput, type MediaItem } from '../media/media';
  import { recentFor } from '../media/recent';
  import PlayerView, { type Row } from '../music/PlayerView.svelte';
  import {
    attachSpotify,
    isSpotifyLive,
    itemsIn,
    loadSpotify,
    seekSpotify,
    SPOTIFY_LISTS,
    spotifyFavs,
    spotifyList,
    spotifyState,
    stepSpotify,
    toggleFavItem,
    toggleSpotify,
    warmSpotify,
    type SpotifyStatus,
  } from './player';
  import { SPOTIFY_PRESETS } from './presets';
  import { SPOTIFY } from './spotify';

  export let paneId = '';
  export let focused = false;
  export let config: Config = {};
  export let updateConfig: (patch: Config) => void = () => {};
  /** Drawn inside the status bar's music panel. */
  export let panel = false;
  $: void paneId, focused;

  const recent = recentFor('spotify');
  $: s = $spotifyState;

  const LABEL: Record<SpotifyStatus, string> = {
    off: 'not playing',
    loading: 'loading',
    ready: 'ready',
    playing: 'playing',
    paused: 'paused',
    error: 'unavailable',
  };

  /* The pane remembers what is loaded (for its title and for share links). A
     pane that arrives with its own item, from a template or a link, loads it,
     unless something was already loaded in this visit. */
  let mounted = false;
  onMount(() => {
    const own = asItem(config.item, SPOTIFY);
    if (own && $spotifyState.status === 'off' && itemKey(own) !== itemKey($spotifyState.item)) loadSpotify(own);
    else if (!panel) warmSpotify();
    mounted = true;
  });
  $: if (mounted && !panel) remember(s.item);
  function remember(item: MediaItem) {
    const own = asItem(config.item, SPOTIFY);
    if (!own || itemKey(own) !== itemKey(item) || own.title !== item.title) updateConfig({ item: { ...item } });
  }

  /* lists: favourites, presets, recent, and Spotify's own frame for the tracks */
  let tracks = false;
  $: lists = [...SPOTIFY_LISTS.map((l) => (l.id === 'favs' ? { ...l, label: `favourites ${$spotifyFavs.length}` } : l)), { id: 'tracks', label: 'tracks' }];
  function chooseList(id: string) {
    tracks = id === 'tracks';
    if (!tracks) spotifyList.set(id);
  }

  let shown: MediaItem[] = [];
  $: shown = itemsIn($spotifyList, $spotifyFavs, $recent);
  let rows: Row[] = [];
  $: rows = shown.map((item) => ({
    key: itemKey(item),
    name: labelOf(item),
    note: findPreset(SPOTIFY_PRESETS, item)?.note ?? item.kind,
    on: itemKey(item) === itemKey(s.item),
    fav: $spotifyFavs.some((f) => itemKey(f) === itemKey(item)),
  }));
  const byKey = (key: string) => shown.find((x) => itemKey(x) === key);

  function pick(key: string) {
    const item = byKey(key);
    if (item) loadSpotify(item, { play: true });
  }
  function favRow(key: string) {
    const item = byKey(key);
    if (item) toggleFavItem(item);
  }

  /* paste a link */
  let draft = '';
  let linkError = '';
  function submit() {
    const text = draft.trim();
    if (!text) return;
    const item = resolveInput(text, SPOTIFY, SPOTIFY_PRESETS);
    if (!item) {
      linkError = SPOTIFY.invalidHint;
      return;
    }
    draft = '';
    linkError = '';
    loadSpotify(item, { play: true });
  }

  function frame(node: HTMLElement) {
    return { destroy: attachSpotify(node) };
  }

  $: preset = findPreset(SPOTIFY_PRESETS, s.item);
</script>

<PlayerView
  kicker="spotify · {s.item.kind}"
  glyph="≋"
  title={labelOf(s.item)}
  note={s.track || preset?.note || ''}
  art={s.art}
  live={isSpotifyLive(s)}
  busy={s.status === 'loading' || s.buffering}
  status={s.buffering && s.status === 'playing' ? 'buffering' : LABEL[s.status]}
  error={s.error}
  fav={$spotifyFavs.some((f) => itemKey(f) === itemKey(s.item))}
  thing="playlist"
  position={s.position}
  duration={s.duration}
  {lists}
  list={tracks ? 'tracks' : $spotifyList}
  {rows}
  stage={tracks}
  empty={$spotifyList === 'favs' ? 'No favourite playlists yet. Press the star next to a playlist, or paste a Spotify link and star it.' : 'Nothing played yet.'}
  {panel}
  on:toggle={toggleSpotify}
  on:step={(e) => stepSpotify(e.detail)}
  on:fav={() => toggleFavItem(s.item)}
  on:favrow={(e) => favRow(e.detail)}
  on:pick={(e) => pick(e.detail)}
  on:list={(e) => chooseList(e.detail)}
  on:seek={(e) => seekSpotify(e.detail)}
>
  <svelte:fragment slot="tools">
    <form class="link" on:submit|preventDefault={submit}>
      <input
        bind:value={draft}
        on:input={() => (linkError = '')}
        class:invalid={!!linkError}
        type="text"
        inputmode="url"
        enterkeyhint="go"
        placeholder="paste a Spotify link to play it"
        aria-label="Spotify link"
        aria-invalid={!!linkError}
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
      />
      <a class="out" href={SPOTIFY.pageUrl(s.item)} target="_blank" rel="noopener noreferrer" title="Open on Spotify" aria-label="Open on Spotify">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3" /></svg>
      </a>
    </form>
    {#if linkError}<p class="link-error" role="alert">{linkError}</p>{/if}
  </svelte:fragment>

  <div class="slot" use:frame />

  <svelte:fragment slot="footer">
    Not logged in to Spotify in this browser? Then you hear 30-second previews. Next track and volume are in "tracks".
  </svelte:fragment>
</PlayerView>

<style>
  .link {
    flex: none;
    display: flex;
    gap: 6px;
    margin: 0;
  }
  .link input {
    flex: 1;
    min-width: 0;
    height: 26px;
    padding: 0 8px;
    border-radius: 6px;
    border: 1px solid color-mix(in srgb, var(--bg2) 85%, transparent);
    background: color-mix(in srgb, var(--bg2) 18%, var(--bg1));
    color: var(--t2);
    font: inherit;
    font-size: 12px;
    outline: none;
  }
  .link input::placeholder {
    color: var(--t1);
    opacity: 0.8;
  }
  .link input:focus {
    border-color: var(--hl1);
  }
  .link input.invalid {
    border-color: color-mix(in srgb, var(--hl1) 70%, var(--t1));
  }
  .out {
    flex: none;
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    color: var(--t1);
  }
  .out:hover {
    color: var(--hl1);
    background: color-mix(in srgb, var(--bg2) 60%, transparent);
  }
  .out svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .link-error {
    flex: none;
    margin: 0;
    color: var(--hl1);
    font-size: 11px;
    line-height: 1.35;
  }
  /* Reserves the room Spotify's own frame is laid over (see player.ts). */
  .slot {
    flex: 1;
    min-height: 0;
    border-radius: 12px;
    background: color-mix(in srgb, var(--bg2) 22%, var(--bg1));
  }
  @media (max-width: 720px), (pointer: coarse) {
    .link input {
      height: 34px;
      font-size: 16px;
    }
    .out {
      width: 34px;
      height: 34px;
    }
  }
</style>
