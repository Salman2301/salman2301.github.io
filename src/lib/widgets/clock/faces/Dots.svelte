<script lang="ts">
  /** A dot-matrix display: 5 x 7 digits, and a row of dots that fills with the seconds. */
  export let now: Date;
  export let hour12 = false;
  export let w = 300;
  export let h = 100;

  // 5 x 7 digits, one string per row, top to bottom
  const FONT: Record<string, string[]> = {
    '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
    '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
    '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
    '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
    '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
    '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
    '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
    ':': ['0', '0', '1', '0', '1', '0', '0'],
    ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  };
  const COLS = 25;
  const ROWS = 7;
  const CELL = 8;

  const pad = (n: number) => String(n).padStart(2, '0');
  $: hours = hour12 ? now.getHours() % 12 || 12 : now.getHours();
  $: text = `${hour12 ? String(hours).padStart(2, ' ') : pad(hours)}:${pad(now.getMinutes())}`;
  // every row of the display, as a string of 0 and 1, COLS wide
  $: lit = Array.from({ length: ROWS }, (_, r) =>
    text
      .split('')
      .map((ch) => FONT[ch][r])
      .join('0'),
  );
  $: secondDots = Math.round((now.getSeconds() / 59) * COLS);
  $: width = Math.max(40, Math.min(w, h * ((COLS * CELL) / ((ROWS + 2) * CELL))));
</script>

<svg class="dots" viewBox="0 0 {COLS * CELL} {(ROWS + 2) * CELL}" {width} role="timer" aria-label={text.trim()}>
  {#each lit as row, r}
    {#each row.split('') as bit, c}
      <circle class:on={bit === '1'} cx={c * CELL + CELL / 2} cy={r * CELL + CELL / 2} r="3" />
    {/each}
  {/each}
  {#each Array(COLS) as _, c}
    <circle class="sec" class:on={c < secondDots} cx={c * CELL + CELL / 2} cy={(ROWS + 1) * CELL + CELL / 2} r="1.8" />
  {/each}
</svg>

<style>
  .dots {
    display: block;
    height: auto;
    max-width: 100%;
  }
  circle {
    fill: color-mix(in srgb, var(--t1) 14%, transparent);
  }
  circle.on {
    fill: var(--t2);
  }
  circle.sec.on {
    fill: var(--hl1);
  }
</style>
