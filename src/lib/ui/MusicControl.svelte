<script lang="ts">
  import { openWidget } from '../core/workspace';
  import { radioState, toggleRadio } from '../widgets/radio/player';

  $: s = $radioState;
  $: live = s.status === 'playing' || s.status === 'connecting';
  $: glyph = s.status === 'error' ? '!' : s.status === 'connecting' ? '…' : live ? '❚❚' : '▶';
</script>

<div class="music" class:live class:error={s.status === 'error'}>
  <button class="play" on:click={toggleRadio} title={live ? 'Pause the radio (Alt+P)' : 'Play the radio (Alt+P)'} aria-label={live ? 'Pause the radio' : 'Play the radio'}>
    {glyph}
  </button>
  <button class="station" on:click={() => openWidget('radio')} title="{s.station.name}: open the radio pane">{s.station.name}</button>
</div>

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
  .station {
    max-width: 130px;
    padding: 0 8px 0 2px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  button:hover,
  button:focus-visible {
    color: var(--t2);
    background: color-mix(in srgb, var(--bg2) 70%, transparent);
    outline: none;
  }
  .live .play,
  .live .station {
    color: var(--hl1);
  }
  .error .play {
    color: var(--hl1);
  }
  @media (max-width: 720px) {
    .station {
      display: none;
    }
  }
</style>
