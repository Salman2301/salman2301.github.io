<script lang="ts">
  /** A seven-segment display: unlit segments stay faintly visible, like an LCD. */
  export let now: Date;
  export let hour12 = false;
  export let w = 300;
  export let h = 100;

  // Segments a to g of one digit in a 36 x 64 box, 7 thick.
  const SEG: Record<string, string> = {
    a: '5,0 31,0 36,3.5 31,7 5,7 0,3.5',
    b: '36,5 39.5,9 39.5,27 36,31 32.5,27 32.5,9',
    c: '36,33 39.5,37 39.5,55 36,59 32.5,55 32.5,37',
    d: '5,57 31,57 36,60.5 31,64 5,64 0,60.5',
    e: '0,33 3.5,37 3.5,55 0,59 -3.5,55 -3.5,37',
    f: '0,5 3.5,9 3.5,27 0,31 -3.5,27 -3.5,9',
    g: '5,28.5 31,28.5 36,32 31,35.5 5,35.5 0,32',
  };
  const ON = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abfgcd'];
  const NAMES = Object.keys(SEG);

  const pad = (n: number) => String(n).padStart(2, '0');
  $: hours = hour12 ? now.getHours() % 12 || 12 : now.getHours();
  // 12-hour time has no leading zero: that digit goes dark
  $: big = (hour12 ? String(hours).padStart(2, ' ') : pad(hours)) + pad(now.getMinutes());
  $: small = pad(now.getSeconds());
  $: blink = now.getSeconds() % 2 === 0;
  const X = [6, 56, 122, 172];
  $: width = Math.max(40, Math.min(w, h * (290 / 78)));
</script>

<svg class="seg" viewBox="0 0 290 78" {width} role="timer" aria-label="{big.slice(0, 2).trim()}:{big.slice(2)}">
  {#each X as x, i}
    <g transform="translate({x} 7)">
      {#each NAMES as n}
        <polygon points={SEG[n]} class:on={big[i] !== ' ' && ON[Number(big[i])].includes(n)} />
      {/each}
    </g>
  {/each}
  <rect class="colon" class:on={blink} x="103.5" y="24" width="7" height="7" rx="1" />
  <rect class="colon" class:on={blink} x="103.5" y="47" width="7" height="7" rx="1" />
  {#each [0, 1] as i}
    <g transform="translate({226 + i * 28} 39) scale(0.5)">
      {#each NAMES as n}
        <polygon points={SEG[n]} class="accent" class:on={ON[Number(small[i])].includes(n)} />
      {/each}
    </g>
  {/each}
  {#if hour12}
    <text x="236" y="24" class:on={now.getHours() < 12}>AM</text>
    <text x="263" y="24" class:on={now.getHours() >= 12}>PM</text>
  {/if}
</svg>

<style>
  .seg {
    display: block;
    height: auto;
    max-width: 100%;
  }
  polygon,
  .colon {
    fill: color-mix(in srgb, var(--t1) 13%, transparent);
  }
  polygon.on,
  .colon.on {
    fill: var(--t2);
  }
  polygon.accent.on {
    fill: var(--hl1);
  }
  text {
    fill: color-mix(in srgb, var(--t1) 25%, transparent);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-anchor: middle;
  }
  text.on {
    fill: var(--hl1);
  }
</style>
