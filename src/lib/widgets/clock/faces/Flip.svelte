<script lang="ts">
  /** Split-flap cards: hours, minutes and smaller seconds. A card drops in when its number changes. */
  export let now: Date;
  export let hour12 = false;
  export let w = 300;
  export let h = 120;

  const pad = (n: number) => String(n).padStart(2, '0');
  $: hh = hour12 ? pad(now.getHours() % 12 || 12) : pad(now.getHours());
  $: mm = pad(now.getMinutes());
  $: ss = pad(now.getSeconds());
  // two cards of 1.5em, a gap, and the seconds card at 0.45 of the size
  $: fs = Math.max(4, Math.min(w / 4.25, h / 1.55));
</script>

<div class="flip" style="font-size:{fs}px" role="timer" aria-label="{hh}:{mm}">
  {#each [hh, mm] as value, i (i)}
    <span class="card">
      {#key value}<span class="digits">{value}</span>{/key}
    </span>
  {/each}
  <span class="card small">
    {#key ss}<span class="digits">{ss}</span>{/key}
    {#if hour12}<span class="period">{now.getHours() < 12 ? 'AM' : 'PM'}</span>{/if}
  </span>
</div>

<style>
  .flip {
    display: flex;
    align-items: flex-end;
    gap: 0.12em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .card {
    position: relative;
    width: 1.5em;
    height: 1.42em;
    display: grid;
    place-items: center;
    overflow: hidden;
    border: 1px solid var(--bg2);
    border-radius: 0.11em;
    background: linear-gradient(color-mix(in srgb, var(--bg2) 55%, var(--bg1)) 0 50%, color-mix(in srgb, var(--bg2) 32%, var(--bg1)) 50% 100%);
    color: var(--t2);
    font-weight: 600;
    perspective: 4em;
  }
  /* the hinge */
  .card::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    border-top: max(1px, 0.02em) solid var(--bg1);
  }
  .card.small {
    font-size: 0.45em;
    color: var(--hl1);
  }
  .digits {
    animation: drop 0.36s ease-out;
    transform-origin: 50% 0;
    backface-visibility: hidden;
  }
  .period {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0.3em;
    font-size: 0.22em;
    letter-spacing: 0.14em;
    text-align: center;
    color: var(--t1);
    z-index: 1;
  }
  @keyframes drop {
    from {
      transform: rotateX(-88deg);
      opacity: 0.3;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .digits {
      animation: none;
    }
  }
</style>
