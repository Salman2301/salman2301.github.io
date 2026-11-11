<script lang="ts">
  import AnalogFace from './AnalogFace.svelte';
  import Bars from './faces/Bars.svelte';
  import Binary from './faces/Binary.svelte';
  import Dots from './faces/Dots.svelte';
  import Flip from './faces/Flip.svelte';
  import Fuzzy from './faces/Fuzzy.svelte';
  import Nerd from './faces/Nerd.svelte';
  import Segments from './faces/Segments.svelte';
  import Terminal from './faces/Terminal.svelte';
  import Words from './faces/Words.svelte';
  import { findFace } from './faces';

  /** Draws one face, by id, into a box of w x h px. Used by the clock and by its gallery. */
  export let face = 'digital';
  export let now: Date;
  export let hour12 = false;
  export let w = 300;
  export let h = 200;
  /** A gallery thumbnail: no sweeping second hand. */
  export let preview = false;

  const pad = (n: number) => String(n).padStart(2, '0');
  $: def = findFace(face);
  $: hours = now.getHours();
  $: hh = hour12 ? String(hours % 12 || 12) : pad(hours);
  $: mm = pad(now.getMinutes());
  $: period = hours < 12 ? 'AM' : 'PM';
  // "88:88" in tabular digits is about 3em wide, plus the small AM / PM
  $: fontSize = Math.max(preview ? 10 : 16, Math.min(w / (hour12 ? 3.4 : 3.1), h / 1.08, 280));
</script>

{#if def?.kind === 'analog'}
  <AnalogFace {face} size={Math.max(preview ? 30 : 48, Math.min(w, h, 520))} {preview} />
{:else if face === 'flip'}
  <Flip {now} {hour12} {w} {h} />
{:else if face === 'segments'}
  <Segments {now} {hour12} {w} {h} />
{:else if face === 'dots'}
  <Dots {now} {hour12} {w} {h} />
{:else if face === 'binary'}
  <Binary {now} {w} {h} />
{:else if face === 'words'}
  <Words {now} {w} {h} />
{:else if face === 'fuzzy'}
  <Fuzzy {now} {w} {h} />
{:else if face === 'terminal'}
  <Terminal {now} {hour12} {w} {h} />
{:else if face === 'bars'}
  <Bars {now} {hour12} {w} {h} />
{:else if face === 'nerd'}
  <Nerd {now} {w} {h} />
{:else}
  <div class="readout" style="font-size:{fontSize}px" role="timer" aria-label="{hh}:{mm}{hour12 ? ` ${period}` : ''}">
    <span class="hm">{hh}<span class="colon">:</span>{mm}</span>
    {#if hour12}<span class="period">{period}</span>{/if}
  </div>
{/if}

<style>
  .readout {
    display: flex;
    align-items: flex-start;
    line-height: 1;
    font-weight: 300;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }
  .colon {
    color: var(--t1);
    margin: 0 -0.04em;
    position: relative;
    top: -0.05em;
  }
  .period {
    margin: 0.2em 0 0 0.25em;
    font-size: 0.17em;
    font-weight: 600;
    letter-spacing: 0.12em;
    color: var(--t1);
  }
</style>
