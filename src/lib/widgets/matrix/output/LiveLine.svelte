<script lang="ts">
  import type { Readable } from 'svelte/store';
  import type { LiveState } from './live';

  export let state: Readable<LiveState>;

  $: pct = $state.progress === undefined ? null : Math.round(Math.max(0, Math.min(1, $state.progress)) * 100);
</script>

<div class="live tone-{$state.tone}" class:stopped={$state.stopped}>{#if pct === null}{$state.text}{:else}<span class="label">{$state.text}</span><span
      class="meter"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={$state.text}><span class="meter-fill" style="width:{pct}%" /></span><span class="pct">{pct}%</span>{/if}</div>

<style>
  /* Reads like a printed terminal line: cancel the margins the terminal puts around rendered blocks. */
  .live {
    margin: -2px 0 -6px;
    min-height: 1.5em;
    white-space: pre;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--t2);
  }
  .stopped {
    opacity: 0.55;
  }
  .label {
    display: inline-block;
    min-width: 19ch;
  }
  .meter {
    display: inline-block;
    vertical-align: -0.15em;
    width: min(24ch, calc(100% - 26ch));
    min-width: 6ch;
    height: 0.95em;
    margin: 0 1ch;
    padding: 2px;
    border: 1px solid currentColor;
    border-radius: 3px;
  }
  .meter-fill {
    display: block;
    height: 100%;
    /* segmented like a block-character bar */
    background: repeating-linear-gradient(90deg, currentColor 0 6px, transparent 6px 8px);
    transition: width 0.08s linear;
  }
  .pct {
    font-variant-numeric: tabular-nums;
  }
  /* same tones as the terminal's printed lines */
  .tone-muted {
    color: var(--t1);
  }
  .tone-accent {
    color: var(--hl1);
  }
  .tone-error {
    color: #ff6b6b;
  }
  .tone-success {
    color: #4ade80;
  }
</style>
