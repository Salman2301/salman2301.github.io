<script lang="ts">
  /** Each digit of HH MM SS as a column of lights: 8, 4, 2, 1 from the top. */
  export let now: Date;
  export let w = 300;
  export let h = 200;

  const BITS = [8, 4, 2, 1];
  const X = [18, 46, 86, 114, 154, 182];
  const pad = (n: number) => String(n).padStart(2, '0');
  $: digits = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`.split('').map(Number);
  $: width = Math.max(40, Math.min(w, h * (200 / 130)));
</script>

<svg class="binary" viewBox="0 0 200 130" {width} role="timer" aria-label="{digits.slice(0, 2).join('')}:{digits.slice(2, 4).join('')}:{digits.slice(4).join('')}">
  {#each BITS as bit, r}
    <text dominant-baseline="central" class="bit" x="3" y={16 + r * 26}>{bit}</text>
    {#each X as x, c}
      <!-- the tens of hours only need 2 and 1, the tens of minutes and seconds 4, 2, 1 -->
      {#if !((c === 0 && r < 2) || ((c === 2 || c === 4) && r < 1))}
        <circle class:on={(digits[c] & bit) !== 0} class:accent={c > 3} cx={x} cy={14 + r * 26} r="9" />
      {/if}
    {/each}
  {/each}
  {#each X as x, c}
    <text dominant-baseline="central" class="digit" {x} y="124">{digits[c]}</text>
  {/each}
</svg>

<style>
  .binary {
    display: block;
    height: auto;
    max-width: 100%;
  }
  circle {
    fill: none;
    stroke: color-mix(in srgb, var(--t1) 45%, transparent);
    stroke-width: 1;
  }
  circle.on {
    fill: var(--t2);
    stroke: var(--t2);
  }
  circle.accent.on {
    fill: var(--hl1);
    stroke: var(--hl1);
  }
  text {
    fill: var(--t1);
    font-size: 8px;
    font-variant-numeric: tabular-nums;
  }
  .digit {
    text-anchor: middle;
    font-size: 9px;
  }
</style>
