<script lang="ts">
  import { tick } from 'svelte';
  import { games, getGame } from '../../core/registry';
  import type { Config } from '../../core/types';
  import GameShell from '../../games/GameShell.svelte';
  import { highScores, plays } from '../../games/scores';

  export let paneId: string;
  export let focused = false;
  export let config: Config = {};
  export let updateConfig: (patch: Config) => void = () => {};

  $: current = typeof config.game === 'string' ? getGame(config.game) : undefined;

  let grid: HTMLDivElement;
  let selected = 0;

  function play(id: string) {
    updateConfig({ game: id });
  }
  function exit() {
    updateConfig({ game: null });
    tick().then(() => focusCard(selected));
  }
  function focusCard(i: number) {
    (grid?.querySelectorAll('button.game')[i] as HTMLElement | undefined)?.focus({ preventScroll: false });
  }

  let wasFocused = false;
  $: {
    if (focused && !wasFocused && !current) tick().then(() => focusCard(selected));
    wasFocused = focused;
  }

  function onKey(e: KeyboardEvent) {
    if (current) return;
    const cards = grid?.querySelectorAll('button.game');
    if (!cards?.length) return;
    const cols = Math.max(1, Math.round(grid.clientWidth / ((cards[0] as HTMLElement).offsetWidth + 10)));
    const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
    if (delta) {
      e.preventDefault();
      selected = Math.min(Math.max(selected + delta, 0), cards.length - 1);
      focusCard(selected);
    }
  }
</script>

{#if current}
  <GameShell game={current} {focused} onExit={exit} />
{:else}
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="arcade" on:keydown={onKey} data-pane={paneId}>
    <pre class="logo" aria-hidden="true">{`  ___  ___  ___  ___  ___  ___
 | A || R || C || A || D || E |
  ---  ---  ---  ---  ---  --- `}</pre>
    <p class="intro">{games.length} quick games, each a 5 to 10 minute break. Scores are saved on this device.</p>
    <div class="grid" bind:this={grid}>
      {#each games as g, i (g.id)}
        <button class="game" class:selected={i === selected} on:click={() => play(g.id)} on:focus={() => (selected = i)}>
          <span class="title">{g.title}</span>
          <span class="desc">{g.description}</span>
          <span class="meta">
            <span>best {$highScores[g.id] ?? '-'}</span>
            <span>played {$plays[g.id] ?? 0}</span>
          </span>
          <span class="controls">{g.controls}</span>
        </button>
      {/each}
      {#if games.length === 0}
        <p class="empty">No games installed yet.</p>
      {/if}
    </div>
    <p class="tip">tip: type <code>play {games[0]?.id ?? 'snake'}</code> in any terminal</p>
  </div>
{/if}

<style>
  .arcade {
    height: 100%;
    overflow: auto;
    padding: 12px 14px 18px;
    color: var(--t2);
  }
  .logo {
    color: var(--hl1);
    font-size: 11px;
    line-height: 1.2;
    margin-bottom: 6px;
  }
  .intro {
    color: var(--t1);
    font-size: 12px;
    margin-bottom: 12px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 10px;
  }
  .game {
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: left;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid var(--bg2);
    color: inherit;
    outline: none;
    transition: border-color 0.12s, transform 0.12s;
  }
  .game:hover,
  .game.selected:focus {
    border-color: var(--hl1);
    transform: translateY(-2px);
  }
  .title {
    color: var(--hl1);
    font-weight: 600;
    font-size: 14px;
  }
  .desc {
    font-size: 12px;
    color: var(--t1);
    flex: 1;
  }
  .meta {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: var(--t2);
    opacity: 0.8;
  }
  .controls {
    font-size: 10px;
    color: var(--t1);
    border-top: 1px dashed var(--bg2);
    padding-top: 4px;
  }
  .empty,
  .tip {
    color: var(--t1);
    font-size: 12px;
  }
  .tip {
    margin-top: 14px;
  }
  code {
    color: var(--hl1);
  }
</style>
