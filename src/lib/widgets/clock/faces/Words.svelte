<script lang="ts">
  import { speak } from './words';

  /**
   * A grid of letters where the words that spell the time light up, to the
   * five minutes. The four dots count the minutes past that.
   */
  export let now: Date;
  export let w = 300;
  export let h = 300;

  const GRID = ['ITLISASAMPM', 'ACQUARTERDC', 'TWENTYFIVEX', 'HALFSTENFTO', 'PASTERUNINE', 'ONESIXTHREE', 'FOURFIVETWO', 'EIGHTELEVEN', 'SEVENTWELVE', 'TENSEOCLOCK'];
  /** Where each word sits: row, first column, length. */
  const AT: Record<string, [number, number, number]> = {
    it: [0, 0, 2],
    is: [0, 3, 2],
    a: [1, 0, 1],
    quarter: [1, 2, 7],
    twenty: [2, 0, 6],
    five: [2, 6, 4],
    half: [3, 0, 4],
    ten: [3, 5, 3],
    to: [3, 9, 2],
    past: [4, 0, 4],
    oclock: [9, 5, 6],
  };
  const HOUR_AT: Record<string, [number, number, number]> = {
    nine: [4, 7, 4],
    one: [5, 0, 3],
    six: [5, 3, 3],
    three: [5, 6, 5],
    four: [6, 0, 4],
    five: [6, 4, 4],
    two: [6, 8, 3],
    eight: [7, 0, 5],
    eleven: [7, 5, 6],
    seven: [8, 0, 5],
    twelve: [8, 5, 6],
    ten: [9, 0, 3],
  };

  $: said = speak(now);
  $: spans = [AT.it, AT.is, ...said.minutes.map((word) => AT[word]), HOUR_AT[said.hour], ...(said.oclock ? [AT.oclock] : [])];
  $: lit = new Set(spans.flatMap(([r, c, n]) => Array.from({ length: n }, (_, i) => `${r}:${c + i}`)));
  $: sentence = `it is ${[...said.minutes, said.hour].join(' ')}${said.oclock ? " o'clock" : ''}`;
  // 11 columns and 10 rows of 1.5em cells, plus the row of dots
  $: fs = Math.max(2, Math.min(w / 16.8, h / 17));
</script>

<div class="words" style="font-size:{fs}px" role="timer" aria-label={sentence}>
  <div class="grid" aria-hidden="true">
    {#each GRID as row, r}
      {#each row.split('') as ch, c}
        <span class:on={lit.has(`${r}:${c}`)}>{ch}</span>
      {/each}
    {/each}
  </div>
  <div class="extra" aria-hidden="true">
    {#each [1, 2, 3, 4] as n}<i class:on={said.extra >= n} />{/each}
  </div>
</div>

<style>
  .words {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5em;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(11, 1.5em);
    grid-auto-rows: 1.5em;
    font-weight: 600;
    line-height: 1.5em;
    text-align: center;
  }
  span {
    color: color-mix(in srgb, var(--t1) 28%, transparent);
    transition: color 0.4s ease;
  }
  span.on {
    color: var(--t2);
    text-shadow: 0 0 0.6em color-mix(in srgb, var(--hl1) 70%, transparent);
  }
  .extra {
    display: flex;
    gap: 0.9em;
  }
  i {
    width: 0.4em;
    height: 0.4em;
    border-radius: 50%;
    background: color-mix(in srgb, var(--t1) 28%, transparent);
  }
  i.on {
    background: var(--hl1);
  }
</style>
