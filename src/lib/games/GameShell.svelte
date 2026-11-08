<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import type { GameApi, GameDef } from '../core/types';
  import { sfx } from '../core/sound';
  import { bestFor, highScores, recordScore } from './scores';

  /**
   * Hosts one game: focus handling, pause/resume, score + best, game over and
   * restart. See GameDef in core/types.ts for the contract games follow.
   */
  export let game: GameDef;
  /** Whether the pane that hosts the shell has focus. */
  export let focused = true;
  export let onExit: (() => void) | null = null;

  let root: HTMLDivElement;
  let runId = 0;
  let score = 0;
  let started = false;
  let userPaused = false;
  let windowFocused = typeof document !== 'undefined' ? document.hasFocus() : true;
  let over: { score: number; message?: string; best: boolean } | null = null;

  $: best = $highScores[game.id] ?? 0;
  $: paused = !started || userPaused || !focused || !windowFocused || over !== null;

  let downHandlers = new Set<(e: KeyboardEvent) => void>();
  let upHandlers = new Set<(e: KeyboardEvent) => void>();

  function makeApi(): GameApi {
    const thisRun = runId;
    return {
      onKeyDown(h) {
        downHandlers.add(h);
        return () => downHandlers.delete(h);
      },
      onKeyUp(h) {
        upHandlers.add(h);
        return () => upHandlers.delete(h);
      },
      setScore(n) {
        if (thisRun === runId && !over) score = n;
      },
      gameOver(finalScore, message) {
        if (thisRun !== runId || over) return;
        const s = finalScore ?? score;
        score = s;
        const isBest = recordScore(game.id, s, game.lowerIsBetter);
        over = { score: s, message, best: isBest };
        sfx(isBest ? 'win' : 'lose');
      },
      get highScore() {
        return bestFor(game.id);
      },
      sfx: (kind) => sfx(kind),
    };
  }

  let api = makeApi();

  async function restart() {
    downHandlers = new Set();
    upHandlers = new Set();
    runId += 1;
    score = 0;
    over = null;
    userPaused = false;
    started = true;
    api = makeApi();
    await tick();
    root?.focus({ preventScroll: true });
  }

  function start() {
    if (!started) {
      started = true;
      sfx('blip');
    }
    root?.focus({ preventScroll: true });
  }

  const BLOCK = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Spacebar']);

  function onKeyDown(e: KeyboardEvent) {
    if (e.altKey || e.metaKey || (e.ctrlKey && e.key !== 'Control')) return; // leave shortcuts alone
    if ((e.target as HTMLElement)?.closest?.('input, textarea, [contenteditable="true"]') && e.target !== root) return;
    if (BLOCK.has(e.key)) e.preventDefault();
    if (over) {
      if (e.key === 'Enter' || e.key === 'r' || e.key === 'R' || e.key === ' ') {
        e.preventDefault();
        restart();
      } else if (e.key === 'Escape' && onExit) onExit();
      return;
    }
    if (!started) {
      if (e.key === 'Escape' && onExit) return onExit();
      start();
      return;
    }
    const pauseKey = e.key === 'Escape' || (!game.captureAllKeys && (e.key === 'p' || e.key === 'P' || e.key === ' '));
    if (pauseKey) {
      e.preventDefault();
      userPaused = !userPaused;
      return;
    }
    if (paused) {
      if (userPaused && (e.key === ' ' || e.key === 'Enter')) userPaused = false;
      return;
    }
    downHandlers.forEach((h) => h(e));
  }

  function onKeyUp(e: KeyboardEvent) {
    if (paused) return;
    upHandlers.forEach((h) => h(e));
  }

  let wasFocused = false;
  $: {
    if (focused && !wasFocused && root) tick().then(() => root?.focus({ preventScroll: true }));
    wasFocused = focused;
  }

  onMount(() => {
    if (focused) root?.focus({ preventScroll: true });
  });
  onDestroy(() => {
    downHandlers.clear();
    upHandlers.clear();
  });
</script>

<svelte:window on:blur={() => (windowFocused = false)} on:focus={() => (windowFocused = true)} />

<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
<div class="shell" bind:this={root} tabindex="0" on:keydown={onKeyDown} on:keyup={onKeyUp} role="application" aria-label={game.title}>
  <div class="bar">
    {#if onExit}
      <button class="btn" on:click={onExit} title="Back to the arcade (Esc on the start or game-over screen)">‹ arcade</button>
    {/if}
    <span class="name">{game.title}</span>
    <span class="spacer" />
    <span class="stat">{game.scoreLabel ?? 'score'} <b>{score}</b></span>
    <span class="stat">best <b>{best}</b></span>
    <button class="btn" on:click={() => (started ? (userPaused = !userPaused) : start())} disabled={!!over}>{paused && started && !over ? 'resume' : 'pause'}</button>
    <button class="btn" on:click={restart}>restart</button>
  </div>

  <div class="stage">
    {#key runId}
      <svelte:component this={game.component} {paused} {api} />
    {/key}

    {#if !started}
      <button class="overlay" on:click={start}>
        <span class="big">{game.title}</span>
        <span class="sub">{game.description}</span>
        <span class="controls">{game.controls}</span>
        <span class="cta">click or press any key to start</span>
      </button>
    {:else if over}
      <div class="overlay">
        <span class="big">{over.best ? 'new best!' : 'game over'}</span>
        {#if over.message}<span class="sub">{over.message}</span>{/if}
        <span class="score">{game.scoreLabel ?? 'score'} {over.score} · best {best}</span>
        <div class="row">
          <button class="pill" on:click={restart}>play again (enter)</button>
          {#if onExit}<button class="pill ghost" on:click={onExit}>arcade (esc)</button>{/if}
        </div>
      </div>
    {:else if paused}
      <button class="overlay soft" on:click={() => { userPaused = false; root?.focus(); }}>
        <span class="big">paused</span>
        <span class="cta">{!focused || !windowFocused ? 'click to resume' : game.captureAllKeys ? 'press esc or click to resume' : 'press space or click to resume'}</span>
      </button>
    {/if}
  </div>
</div>

<style>
  .shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    outline: none;
    color: var(--t2);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    font-size: 12px;
    color: var(--t1);
    border-bottom: 1px dashed color-mix(in srgb, var(--bg2) 80%, transparent);
    white-space: nowrap;
    overflow: hidden;
  }
  .name {
    color: var(--hl1);
    font-weight: 600;
  }
  .spacer {
    flex: 1;
  }
  .stat b {
    color: var(--t2);
    font-weight: 600;
  }
  .btn {
    padding: 1px 8px;
    border-radius: 4px;
    border: 1px solid var(--bg2);
    color: var(--t1);
  }
  .btn:hover:not(:disabled) {
    color: var(--hl1);
    border-color: var(--hl1);
  }
  .btn:disabled {
    opacity: 0.4;
  }
  .stage {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .overlay {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 16px;
    text-align: center;
    color: var(--t2);
    background: color-mix(in srgb, var(--bg1) 82%, transparent);
    backdrop-filter: blur(2px);
  }
  .overlay.soft {
    background: color-mix(in srgb, var(--bg1) 60%, transparent);
  }
  .big {
    font-size: 26px;
    font-weight: 700;
    color: var(--hl1);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .sub {
    max-width: 420px;
    font-size: 13px;
    color: var(--t1);
  }
  .controls {
    font-size: 12px;
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid var(--bg2);
    color: var(--t1);
  }
  .cta {
    font-size: 12px;
    color: var(--t2);
    animation: blink 1.4s steps(2, start) infinite;
  }
  .score {
    font-size: 14px;
  }
  .row {
    display: flex;
    gap: 8px;
    margin-top: 6px;
  }
  .pill {
    padding: 5px 14px;
    border-radius: 999px;
    background: var(--hl1);
    color: var(--bg1);
    font-size: 12px;
  }
  .pill.ghost {
    background: transparent;
    color: var(--t2);
    border: 1px solid var(--bg2);
  }
  @keyframes blink {
    to {
      visibility: hidden;
    }
  }
</style>
