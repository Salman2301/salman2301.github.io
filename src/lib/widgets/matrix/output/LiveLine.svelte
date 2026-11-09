<script lang="ts">
  import type { Readable } from 'svelte/store';
  import type { LiveState } from './live';

  export let state: Readable<LiveState>;

  $: pct = $state.progress === undefined ? null : Math.round(Math.max(0, Math.min(1, $state.progress)) * 100);
</script>

<!-- A <pre>, so columns line up like the other monospace output (the whoami banner, the neofetch logo). -->
<pre class="live tone-{$state.tone}" class:stopped={$state.stopped} class:metered={pct !== null} class:banner={$state.banner}>{#if pct === null}{$state.text}{:else}<span
      class="label">{$state.text}</span><span
      class="meter"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={$state.text}><span class="meter-fill" style="width:{pct}%" /></span><span class="pct">{pct}%</span>{/if}</pre>

<style>
  /* Reads like a printed terminal line: cancel the margins the terminal puts around rendered blocks. */
  .live {
    margin: -2px 0 -6px;
    min-height: 1.5em;
    line-height: inherit;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: var(--t2);
  }
  /* a progress bar stays on one line and gives up the label first */
  .metered {
    white-space: pre;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .stopped {
    opacity: 0.55;
  }
  .banner {
    width: fit-content;
    max-width: 100%;
    margin: 8px 0 2px;
    padding: 2px 2ch;
    border: 1px solid currentColor;
    border-radius: 4px;
    box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 18%, transparent);
    font-weight: 700;
    letter-spacing: 0.2em;
    animation: flicker 0.45s steps(1) both;
  }
  @keyframes flicker {
    0%,
    40% {
      opacity: 0;
    }
    20%,
    60% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .banner {
      animation: none;
    }
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
