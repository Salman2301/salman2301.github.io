<script lang="ts">
  import { nowPlaying, toggleMusic } from '../core/music';
  import MusicPanel from './MusicPanel.svelte';

  /**
   * The music player of the status bar: play / pause for whichever of radio
   * and Spotify you used last, and its name, which opens the full controls.
   */
  let open = false;

  $: n = $nowPlaying;
  $: name = n.source === 'radio' ? 'the radio' : 'Spotify';
  $: glyph = n.error ? '!' : n.busy ? '…' : n.live ? '❚❚' : '▶';
</script>

<div class="music" class:live={n.live} class:error={n.error}>
  <button class="play" data-music-keep on:click={toggleMusic} title={n.live ? `Pause ${name} (Alt+P)` : `Play ${name} (Alt+P)`} aria-label={n.live ? `Pause ${name}` : `Play ${name}`}>
    {glyph}
  </button>
  <button class="name" class:open data-music-toggle aria-expanded={open} aria-haspopup="dialog" on:click={() => (open = !open)} title="{n.title}: radio, Spotify and favourites">
    <span class="note" aria-hidden="true">♪</span><span class="label">{n.title}</span>
  </button>
</div>

<MusicPanel bind:open />

<style>
  .music {
    display: flex;
    align-items: stretch;
    border-left: 1px solid color-mix(in srgb, var(--bg2) 80%, transparent);
    color: var(--t1);
  }
  button {
    display: flex;
    align-items: center;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 12px;
    white-space: nowrap;
    cursor: pointer;
  }
  .play {
    width: 26px;
    justify-content: center;
    font-size: 10px;
  }
  .name {
    gap: 5px;
    max-width: 160px;
    padding: 0 8px 0 2px;
  }
  .label {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .note {
    display: none;
  }
  button:hover,
  button:focus-visible,
  .name.open {
    color: var(--t2);
    background: color-mix(in srgb, var(--bg2) 70%, transparent);
    outline: none;
  }
  .live .play,
  .live .name,
  .name.open {
    color: var(--hl1);
  }
  .error .play {
    color: var(--hl1);
  }
  @media (max-width: 720px) {
    /* no room for the name on a phone: a note opens the panel instead */
    .label {
      display: none;
    }
    .note {
      display: inline;
    }
    .name {
      padding: 0 8px;
    }
  }
</style>
