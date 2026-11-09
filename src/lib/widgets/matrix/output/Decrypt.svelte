<script lang="ts">
  import type { Readable } from 'svelte/store';
  import { measureWidth, type DecryptState } from './live';

  /** A scrolling hex dump whose bytes settle, one by one, into `secret`. */
  export let state: Readable<DecryptState>;
  export let secret: string;
  export let seed = 1;

  // "0x0000  " + "xx " per byte + " " + one ascii char per byte
  const FIXED_COLS = 9;
  const COLS_PER_BYTE = 4;

  // Like a real hex dump: 16, 8 or 4 bytes per row, whichever fits.
  let perRow = 8;
  function onWidth(width: number, fontPx: number) {
    const fits = Math.floor((Math.floor(width / (fontPx * 0.6)) - FIXED_COLS) / COLS_PER_BYTE);
    perRow = fits >= 16 ? 16 : fits >= 8 ? 8 : 4;
  }
  // Just enough rows to hold the secret, so a wide dump is not mostly zero padding.
  $: rowCount = Math.max(2, Math.ceil(secret.length / perRow));

  interface Cell {
    hex: string;
    ch: string;
    locked: boolean;
  }

  /** Small integer hash, so the dump is stable for a given line and frame. */
  function hash(a: number, b: number): number {
    let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be59b, 0xc2b2ae35);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
    h = Math.imul(h, 0x297a2d39);
    return (h ^ (h >>> 15)) >>> 0;
  }

  const printable = (b: number) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.');
  const hex = (b: number) => b.toString(16).padStart(2, '0');

  function cell(s: DecryptState, line: number, col: number, index: number): Cell {
    const decrypting = s.reveal > 0;
    if (decrypting && hash(seed, index + 7919) / 2 ** 32 < s.reveal) {
      // past the end of the secret is zero padding
      const b = index < secret.length ? secret.charCodeAt(index) & 0xff : 0;
      return { hex: hex(b), ch: printable(b), locked: index < secret.length };
    }
    // while scrolling a line keeps its bytes; once decrypting starts the rest flickers
    const b = hash(seed + line * 131 + col, decrypting ? s.frame : 0) & 0xff;
    return { hex: hex(b), ch: printable(b), locked: false };
  }

  $: rows = Array.from({ length: rowCount }, (_, r) => {
    const line = $state.line + r;
    return {
      offset: `0x${(line * perRow).toString(16).padStart(4, '0')}`,
      cells: Array.from({ length: perRow }, (_, c) => cell($state, line, c, r * perRow + c)),
    };
  });
</script>

<pre class="dump" class:stopped={$state.stopped} use:measureWidth={onWidth} aria-label="decrypting">{#each rows as row, i}{#if i}{'\n'}{/if}<span
      class="off">{row.offset}</span>{'  '}{#each row.cells as c}<span class:locked={c.locked}>{c.hex}</span>{' '}{/each}{' '}{#each row.cells as c}<span
        class:locked={c.locked}>{c.ch}</span>{/each}{/each}</pre>

<style>
  .dump {
    margin: 0;
    line-height: inherit;
    color: var(--t1);
    white-space: pre;
    overflow: hidden;
  }
  .stopped {
    opacity: 0.55;
  }
  .off {
    color: color-mix(in srgb, var(--t1) 70%, transparent);
  }
  .locked {
    color: var(--hl1);
  }
</style>
