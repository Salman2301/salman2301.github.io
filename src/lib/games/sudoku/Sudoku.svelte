<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { get } from 'svelte/store';
  import type { GameApi } from '../../core/types';
  import { keyName } from '../kit';
  import {
    conflicts, enter, erase, formatTime, hasProgress, hint, isWrong, MAX_MISTAKES, points, remaining, toggleNote, undo,
    type GameState, type MoveResult,
  } from './board';
  import { BOX_OF, BOXES, COL_OF, DIFFICULTIES, ROW_OF, type Difficulty } from './generator';
  import { computeLayout } from './layout';
  import { bestTimes, difficulty, game, generating, newPuzzle, recordTime, saveNow } from './store';

  export let paused = true;
  export let api: GameApi;

  // GameShell remounts its game on "restart" while it is already running, so
  // a mount that is not paused means the player asked for a fresh puzzle.
  // Any other mount (reload, coming back from another game) resumes.
  const restarted = !paused;

  const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const SHORT: Record<Difficulty, string> = { easy: 'easy', medium: 'med', hard: 'hard' };
  const EMPTY: number[] = new Array(81).fill(0);
  const MOVES: Record<string, [number, number]> = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
  const touch = typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches;

  let w = 0;
  let h = 0;
  $: L = computeLayout(w, h, touch);
  $: panelW = L.mode === 'side' ? 3 * L.keyW + 2 * L.keyGap : L.board;
  $: contentW = L.mode === 'side' ? L.board + L.gap + panelW : L.board;
  $: narrowBar = contentW < 330;
  $: badges = L.keyW >= 26;
  $: dots = L.cell < 24;

  let sel = 40;
  let notesMode = false;

  // While a new puzzle is generated the old one is hidden, never played.
  $: g = $generating ? null : $game;
  $: playing = !!g && g.status === 'playing';
  $: values = g?.values ?? EMPTY;
  $: notes = g?.notes ?? EMPTY;
  $: clash = conflicts(values);
  $: left = g ? remaining(g) : [0, 9, 9, 9, 9, 9, 9, 9, 9, 9];
  $: hinted = new Set(g?.hinted ?? []);
  $: selDigit = values[sel];
  $: current = g?.difficulty ?? $difficulty;
  $: best = $bestTimes[current];
  $: if (g) api.setScore(points(g));

  let shownId = '';
  $: if (g && g.id !== shownId) resetView(g);

  function resetView(s: GameState) {
    shownId = s.id;
    const open = s.values.indexOf(0);
    sel = open < 0 ? 40 : open;
    notesMode = false;
    flash = new Map();
  }

  const related = (i: number, j: number) => ROW_OF[i] === ROW_OF[j] || COL_OF[i] === COL_OF[j] || BOX_OF[i] === BOX_OF[j];

  /* ------------------------------------------------------------- clock */

  // Play time accumulates here and is folded into the saved game once a
  // second, at every move and whenever the clock stops.
  let acc = 0;
  let last = 0;
  $: running = playing && !paused;
  $: if (!running) flushClock();

  function tickClock() {
    const t = performance.now();
    const dt = last ? Math.min(1000, t - last) : 0;
    last = t;
    if (!running || document.hidden) return;
    acc += dt;
    if (acc >= 1000) flushClock();
  }

  function flushClock() {
    if (!acc) return;
    const add = acc;
    acc = 0;
    game.update((s) => (s && s.status === 'playing' ? { ...s, elapsedMs: s.elapsedMs + add } : s));
  }

  function persistNow() {
    flushClock();
    saveNow();
  }

  // Mobile browsers may kill a hidden tab without a pagehide, so save on hide too.
  function onVisibility() {
    if (document.hidden) persistNow();
  }

  /* ------------------------------------------------------------- moves */

  function apply(move: (s: GameState) => MoveResult): MoveResult | null {
    const s = get(game);
    if (!s || s.status !== 'playing' || get(generating)) return null;
    const timed = acc ? { ...s, elapsedMs: s.elapsedMs + acc } : s;
    acc = 0;
    const r = move(timed);
    if (r.outcome === 'none') {
      if (timed !== s) game.set(timed);
      return r;
    }
    game.set(r.state);
    react(r);
    return r;
  }

  function react(r: MoveResult) {
    const cell = r.cell ?? sel;
    switch (r.outcome) {
      case 'placed':
      case 'hinted':
        if (r.completed?.length) {
          flashFrom(r.completed, cell);
          api.sfx('score');
        } else api.sfx('blip');
        break;
      case 'mistake':
        shakeCell(cell);
        api.sfx('hit');
        break;
      case 'lost':
        shakeCell(cell);
        finish(r.state);
        break;
      case 'solved':
        flashFrom(r.completed ?? [], cell);
        finish(r.state);
        break;
      case 'undone':
        sel = cell;
        break;
    }
  }

  function press(d: number) {
    if (notesMode) apply((s) => toggleNote(s, sel, d));
    else apply((s) => enter(s, sel, d));
  }

  function clearCell() {
    apply((s) => erase(s, sel));
  }

  function giveHint() {
    const r = apply((s) => hint(s, sel));
    if (r && r.cell !== undefined) {
      sel = r.cell;
      showPenalty();
    }
  }

  function moveSel(dr: number, dc: number) {
    sel = ((ROW_OF[sel] + dr + 9) % 9) * 9 + ((COL_OF[sel] + dc + 9) % 9);
  }

  function onKey(e: KeyboardEvent) {
    const move = MOVES[keyName(e)];
    if (move) {
      e.preventDefault();
      moveSel(move[0], move[1]);
      return;
    }
    const digit = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
    if (digit) {
      e.preventDefault();
      if (digit[1] === '0') clearCell();
      else press(Number(digit[1]));
      return;
    }
    if (e.code === 'Backspace' || e.code === 'Delete' || e.code === 'NumpadDecimal') {
      e.preventDefault();
      clearCell();
    } else if (e.code === 'KeyN') notesMode = !notesMode;
    else if (e.code === 'KeyH') giveHint();
    else if (e.code === 'KeyU') apply(undo);
  }

  /* --------------------------------------------------------- game end */

  let endTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingEnd: (() => void) | null = null;

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  function finish(s: GameState) {
    const time = formatTime(s.elapsedMs);
    if (s.status === 'solved') {
      const fastest = recordTime(s.difficulty, s.elapsedMs);
      const extras = [s.hints ? plural(s.hints, 'hint') : '', s.mistakes ? plural(s.mistakes, 'mistake') : ''].filter(Boolean);
      const message = [`solved ${s.difficulty} in ${time}${fastest ? ' (best time)' : ''}`, ...extras].join(' · ');
      const score = points(s);
      pendingEnd = () => api.gameOver(score, message);
    } else {
      api.sfx('hit');
      pendingEnd = () => api.gameOver(0, `${MAX_MISTAKES} mistakes on ${s.difficulty} after ${time}. The next one is yours.`);
    }
    // Let the last flash or shake play before the shell's overlay covers it.
    endTimer = setTimeout(endNow, s.status === 'solved' ? 1100 : 700);
  }

  function endNow() {
    clearTimeout(endTimer);
    const end = pendingEnd;
    pendingEnd = null;
    end?.();
  }

  /* ----------------------------------------------------------- effects */

  let flash = new Map<number, number>();
  let flashOdd = false;
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  let shake = -1;
  let shakeOdd = false;
  let shakeTimer: ReturnType<typeof setTimeout> | undefined;
  let penalty = false;
  let penaltyTimer: ReturnType<typeof setTimeout> | undefined;

  /** Flash cells in a ripple spreading out from `origin`. Alternating class names restart the animation. */
  function flashFrom(cells: number[], origin: number) {
    const dist = (c: number) => Math.abs(ROW_OF[c] - ROW_OF[origin]) + Math.abs(COL_OF[c] - COL_OF[origin]);
    flash = new Map(cells.map((c) => [c, dist(c) * 32]));
    flashOdd = !flashOdd;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => (flash = new Map()), 1400);
  }

  function shakeCell(i: number) {
    shake = i;
    shakeOdd = !shakeOdd;
    clearTimeout(shakeTimer);
    shakeTimer = setTimeout(() => (shake = -1), 450);
  }

  function showPenalty() {
    penalty = true;
    clearTimeout(penaltyTimer);
    penaltyTimer = setTimeout(() => (penalty = false), 1600);
  }

  /* -------------------------------------------------------- difficulty */

  let armed: Difficulty | null = null;
  let armTimer: ReturnType<typeof setTimeout> | undefined;

  /** Switch difficulty. With work in progress the first click only asks ("new?"), the second one starts over. */
  function pickLevel(d: Difficulty) {
    const s = get(game);
    const busy = !!s && !get(generating) && hasProgress(s);
    if (busy && armed !== d) {
      armed = d;
      clearTimeout(armTimer);
      armTimer = setTimeout(() => (armed = null), 2500);
      return;
    }
    armed = null;
    if (!busy && s?.status === 'playing' && s.difficulty === d) return;
    newPuzzle(d);
  }

  /* -------------------------------------------------------------- a11y */

  function describe(i: number): string {
    const where = `row ${ROW_OF[i] + 1}, column ${COL_OF[i] + 1}`;
    if (!g) return where;
    const v = g.values[i];
    if (v) return `${where}: ${g.givens[i] ? 'given ' : ''}${v}${isWrong(g, i) ? ', wrong' : ''}`;
    const marks = DIGITS.filter((d) => g && g.notes[i] & (1 << (d - 1)));
    return `${where}: empty${marks.length ? `, notes ${marks.join(' ')}` : ''}`;
  }
  $: announce = describe(sel);

  /* --------------------------------------------------------- lifecycle */

  let offKey: () => void = () => {};
  let clock: ReturnType<typeof setInterval> | undefined;

  onMount(() => {
    offKey = api.onKeyDown(onKey);
    clock = setInterval(tickClock, 250);
    document.addEventListener('visibilitychange', onVisibility);
    const s = get(game);
    if (restarted || !s || s.status !== 'playing') newPuzzle(get(difficulty));
  });

  onDestroy(() => {
    offKey();
    clearInterval(clock);
    document.removeEventListener('visibilitychange', onVisibility);
    [flashTimer, shakeTimer, penaltyTimer, armTimer].forEach((t) => clearTimeout(t));
    endNow();
    flushClock();
  });
</script>

<svelte:window on:pagehide={persistNow} />

<div
  class="sudoku"
  class:veiled={paused && playing}
  class:touch
  bind:clientWidth={w}
  bind:clientHeight={h}
  style="--inset:{L.inset}px;--gap:{L.gap}px;--kg:{L.keyGap}px;--cs:{L.cell}px;--kh:{L.keyH}px;--kw:{L.keyW}px;--ah:{L.actionH}px"
>
  {#if L.bar}
    <div class="topbar" style="width:{contentW}px;height:{L.barH}px">
      <div class="levels" aria-label="Difficulty">
        {#each DIFFICULTIES as d}
          <button
            class:on={d === current}
            class:armed={armed === d}
            aria-pressed={d === current}
            title={armed === d ? 'Click again to start a new puzzle' : `New ${d} puzzle`}
            on:mousedown|preventDefault
            on:click={() => pickLevel(d)}>{armed === d ? 'new?' : narrowBar ? SHORT[d] : d}</button
          >
        {/each}
      </div>
      <span class="fill" />
      {#if best !== undefined && contentW >= 460}
        <span class="stat">best <b>{formatTime(best)}</b></span>
      {/if}
      <span class="stat" class:warn={(g?.mistakes ?? 0) > 0} title="{MAX_MISTAKES} mistakes end the game">
        {narrowBar ? '✕' : 'mistakes'} <b>{g?.mistakes ?? 0}/{MAX_MISTAKES}</b>
      </span>
      <span class="stat clock">
        {#if penalty}<span class="penalty">+30s</span>{/if}
        <b>{formatTime(g?.elapsedMs ?? 0)}</b>
      </span>
    </div>
  {/if}

  <div class="main {L.mode}">
    <div class="board" style="width:{L.board}px;height:{L.board}px" aria-label="Sudoku board" data-difficulty={current}>
      {#each BOXES as cells}
        <div class="box">
          {#each cells as i (i)}
            {@const v = values[i]}
            {@const n = notes[i]}
            <div
              class="cell"
              class:given={g?.givens[i]}
              class:hint-cell={hinted.has(i)}
              class:wrong={g && isWrong(g, i)}
              class:clash={clash[i]}
              class:related={related(i, sel)}
              class:same={v !== 0 && v === selDigit}
              class:selected={i === sel}
              class:flash-a={flash.has(i) && !flashOdd}
              class:flash-b={flash.has(i) && flashOdd}
              style={flash.has(i) ? `--fd:${flash.get(i)}ms` : undefined}
              data-i={i}
              data-v={v}
              data-notes={n}
              data-given={g?.givens[i] ? '' : undefined}
              on:pointerdown={() => (sel = i)}
            >
              {#if v}
                <span class="digit" class:shake-a={shake === i && !shakeOdd} class:shake-b={shake === i && shakeOdd}>{v}</span>
              {:else if n}
                <span class="marks" class:dots>
                  {#each DIGITS as d}
                    {@const on = (n & (1 << (d - 1))) !== 0}
                    <span class:on class:lit={on && d === selDigit}>{on && !dots ? d : ''}</span>
                  {/each}
                </span>
              {/if}
            </div>
          {/each}
        </div>
      {/each}
      {#if $generating}
        <span class="status-note">generating…</span>
      {/if}
    </div>

    <div class="keypad" style="width:{panelW}px">
      <div class="digits">
        {#each DIGITS as d}
          <button
            class="key"
            class:noting={notesMode}
            class:same-key={d === selDigit}
            disabled={!playing || left[d] === 0}
            aria-label="{notesMode ? 'note' : 'enter'} {d}, {left[d]} left"
            on:mousedown|preventDefault
            on:click={() => press(d)}
          >
            <span class="num">{d}</span>
            {#if badges && playing}<span class="badge">{left[d]}</span>{/if}
          </button>
        {/each}
      </div>
      {#if L.actions}
        <div class="tools">
          <button class="tool" disabled={!playing} on:mousedown|preventDefault on:click={clearCell} title="Clear the cell (0, Backspace)">
            erase{#if !touch}<kbd>0</kbd>{/if}
          </button>
          <button class="tool" class:on={notesMode} aria-pressed={notesMode} disabled={!playing} on:mousedown|preventDefault on:click={() => (notesMode = !notesMode)} title="Pencil notes (n)">
            notes{#if !touch}<kbd>n</kbd>{/if}
          </button>
          <button class="tool" disabled={!playing} on:mousedown|preventDefault on:click={giveHint} title="Reveal a cell, costs 30 seconds (h)">
            hint{#if !touch}<kbd>h</kbd>{/if}
          </button>
          <button class="tool" disabled={!playing || !g?.history.length} on:mousedown|preventDefault on:click={() => apply(undo)} title="Undo (u)">
            undo{#if !touch}<kbd>u</kbd>{/if}
          </button>
        </div>
      {/if}
    </div>
  </div>

  <p class="announce" aria-live="polite">{announce}</p>
</div>

<style>
  .sudoku {
    --line-thick: color-mix(in srgb, var(--t1) 78%, var(--bg1));
    --line-thin: color-mix(in srgb, var(--bg2) 88%, var(--bg1));
    --related: color-mix(in srgb, var(--bg2) 34%, var(--bg1));
    --same: color-mix(in srgb, var(--hl1) 20%, var(--bg1));
    --picked: color-mix(in srgb, var(--hl1) 32%, var(--bg1));
    --bad: color-mix(in srgb, #e5484d 82%, var(--t2));
    --bad-bg: color-mix(in srgb, #e5484d 30%, transparent);
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--gap);
    padding: var(--inset);
    overflow: hidden;
    color: var(--t2);
    user-select: none;
    -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  /* GameShell shows an arrow pad on touch screens; this game has its own keypad and taps cells directly. */
  :global(.shell:has(.sudoku) > .pad) {
    display: none;
  }

  /* ------------------------------------------------------------ top bar */
  .topbar {
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: 100%;
    font-size: 12px;
    color: var(--t1);
    white-space: nowrap;
  }
  .levels {
    display: flex;
    border: 1px solid var(--bg2);
    border-radius: 999px;
    padding: 2px;
    height: 100%;
    max-height: 26px;
  }
  .touch .levels {
    max-height: 36px;
  }
  .levels button {
    padding: 0 10px;
    border-radius: 999px;
    color: var(--t1);
    font-size: 12px;
    touch-action: manipulation;
  }
  .touch .levels button {
    padding: 0 12px;
  }
  .levels button:hover {
    color: var(--t2);
  }
  .levels button.on {
    background: var(--hl1);
    color: var(--bg1);
  }
  .levels button.armed {
    background: transparent;
    color: var(--hl1);
    box-shadow: inset 0 0 0 1px var(--hl1);
  }
  .fill {
    flex: 1;
  }
  .stat b {
    color: var(--t2);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .stat.warn b {
    color: var(--bad);
  }
  .clock {
    position: relative;
  }
  .penalty {
    position: absolute;
    right: 0;
    bottom: 100%;
    font-size: 10px;
    color: var(--bad);
    animation: rise 1.6s ease-out forwards;
  }

  /* -------------------------------------------------------------- board */
  .main {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--gap);
  }
  .main.bottom {
    flex-direction: column;
  }
  .board {
    position: relative;
    flex: none;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2px;
    padding: 2px;
    border-radius: 3px;
    background: var(--line-thick);
    touch-action: manipulation;
  }
  .box {
    display: grid;
    grid-template-columns: repeat(3, var(--cs));
    grid-auto-rows: var(--cs);
    gap: 1px;
    background: var(--line-thin);
  }
  .cell {
    position: relative;
    display: grid;
    place-items: center;
    background-color: var(--bg1);
    color: var(--hl1);
    font-size: calc(var(--cs) * 0.6);
    line-height: 1;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }
  .cell.related {
    background-color: var(--related);
  }
  .cell.same {
    background-color: var(--same);
  }
  .cell.selected {
    background-color: var(--picked);
    box-shadow: inset 0 0 0 2px var(--hl1);
  }
  .cell.given {
    color: var(--t2);
    font-weight: 700;
  }
  .cell.hint-cell {
    color: var(--t2);
    font-weight: 600;
  }
  .cell.hint-cell::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: 12%;
    width: 18%;
    height: 2px;
    margin-left: -9%;
    border-radius: 1px;
    background: var(--hl1);
  }
  /*
   * Wrong and repeated digits are hatched in red, so they read as a problem in
   * every theme, including those whose accent (used for entered digits) is red.
   */
  .cell.clash,
  .cell.wrong {
    background-image: repeating-linear-gradient(-45deg, var(--bad-bg) 0 3px, transparent 3px 6px);
  }
  .cell.wrong {
    color: var(--bad);
    font-weight: 700;
  }
  .cell::before {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--hl1);
    opacity: 0;
    pointer-events: none;
  }
  .cell.flash-a::before {
    animation: flash-a 0.75s ease-out var(--fd, 0ms);
  }
  .cell.flash-b::before {
    animation: flash-b 0.75s ease-out var(--fd, 0ms);
  }
  .digit {
    position: relative;
  }
  .shake-a {
    animation: shake-a 0.4s ease-in-out;
  }
  .shake-b {
    animation: shake-b 0.4s ease-in-out;
  }
  .marks {
    position: absolute;
    inset: 1px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(3, 1fr);
    place-items: center;
    font-size: calc(var(--cs) * 0.27);
    font-weight: 500;
    color: var(--t1);
  }
  .marks .lit {
    color: var(--hl1);
    font-weight: 700;
  }
  .marks.dots .on::before {
    content: '';
    display: block;
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: currentColor;
  }
  .veiled .digit,
  .veiled .marks {
    visibility: hidden;
  }
  .status-note {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-size: 12px;
    color: var(--t1);
  }

  /* ------------------------------------------------------------- keypad */
  .keypad {
    display: flex;
    flex-direction: column;
    gap: var(--kg);
    flex: none;
  }
  .side .keypad {
    gap: var(--gap);
  }
  .digits {
    display: grid;
    gap: var(--kg);
    grid-template-columns: repeat(9, 1fr);
    grid-auto-rows: var(--kh);
  }
  .side .digits {
    grid-template-columns: repeat(3, var(--kw));
  }
  .key,
  .tool {
    border-radius: 7px;
    border: 1px solid var(--bg2);
    touch-action: manipulation;
  }
  .key {
    position: relative;
    display: grid;
    place-items: center;
    min-width: 0;
    background: color-mix(in srgb, var(--bg2) 22%, var(--bg1));
    color: var(--t2);
    font-size: clamp(11px, calc(var(--kh) * 0.46), 24px);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .key.same-key {
    border-color: color-mix(in srgb, var(--hl1) 60%, var(--bg2));
  }
  .key.noting .num {
    font-size: 0.62em;
    font-weight: 500;
    color: var(--t1);
  }
  .key:hover:not(:disabled),
  .tool:hover:not(:disabled) {
    border-color: var(--hl1);
    color: var(--hl1);
  }
  .key:hover:not(:disabled) .num {
    color: inherit;
  }
  .key:active:not(:disabled),
  .tool:active:not(:disabled) {
    background: var(--hl1);
    border-color: var(--hl1);
    color: var(--bg1);
  }
  .key:disabled,
  .tool:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .badge {
    position: absolute;
    top: 2px;
    right: 4px;
    font-size: clamp(8px, calc(var(--kh) * 0.2), 11px);
    font-weight: 500;
    color: var(--t1);
  }
  .tools {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-auto-rows: var(--ah);
    gap: var(--kg);
  }
  .side .tools {
    grid-template-columns: repeat(2, 1fr);
  }
  .tool {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 0;
    padding: 0 4px;
    font-size: 12px;
    color: var(--t1);
    background: transparent;
  }
  .tool.on {
    border-color: var(--hl1);
    color: var(--hl1);
    background: color-mix(in srgb, var(--hl1) 14%, transparent);
  }
  kbd {
    font: inherit;
    font-size: 10px;
    padding: 0 4px;
    border-radius: 3px;
    border: 1px solid var(--bg2);
    color: var(--t1);
    opacity: 0.8;
  }
  .announce {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  @keyframes flash-a {
    25% {
      opacity: 0.5;
    }
    to {
      opacity: 0;
    }
  }
  @keyframes flash-b {
    25% {
      opacity: 0.5;
    }
    to {
      opacity: 0;
    }
  }
  @keyframes shake-a {
    20%,
    60% {
      transform: translateX(-12%);
    }
    40%,
    80% {
      transform: translateX(12%);
    }
  }
  @keyframes shake-b {
    20%,
    60% {
      transform: translateX(-12%);
    }
    40%,
    80% {
      transform: translateX(12%);
    }
  }
  @keyframes rise {
    from {
      opacity: 1;
      transform: translateY(4px);
    }
    to {
      opacity: 0;
      transform: translateY(-6px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .cell.flash-a::before,
    .cell.flash-b::before,
    .shake-a,
    .shake-b,
    .penalty {
      animation-duration: 0.01ms;
    }
  }
</style>
