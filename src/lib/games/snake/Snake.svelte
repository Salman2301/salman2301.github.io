<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { GameApi } from '../../core/types';

  export let paused = true;
  export let api: GameApi;

  const CELL = 22;
  let w = 0;
  let h = 0;
  $: cols = Math.max(8, Math.floor(w / CELL));
  $: rows = Math.max(8, Math.floor(h / CELL));

  type P = [number, number];
  let snake: P[] = [
    [3, 2],
    [2, 2],
    [1, 2],
  ];
  let dir: P = [1, 0];
  const queue: P[] = [];
  let food: P = [8, 6];
  let score = 0;
  let dead = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function placeFood() {
    for (let i = 0; i < 500; i++) {
      const p: P = [Math.floor(Math.random() * cols), Math.floor(Math.random() * rows)];
      if (!snake.some(([x, y]) => x === p[0] && y === p[1])) return (food = p);
    }
  }

  function step() {
    if (paused || dead) return;
    const next = queue.shift();
    if (next) dir = next;
    const [hx, hy] = snake[0];
    const head: P = [hx + dir[0], hy + dir[1]];
    const hitWall = head[0] < 0 || head[1] < 0 || head[0] >= cols || head[1] >= rows;
    const hitSelf = snake.some(([x, y]) => x === head[0] && y === head[1]);
    if (hitWall || hitSelf) {
      dead = true;
      api.sfx('hit');
      api.gameOver(score, hitWall ? 'hit the wall' : 'bit yourself');
      return;
    }
    snake = [head, ...snake];
    if (head[0] === food[0] && head[1] === food[1]) {
      score += 1;
      api.setScore(score);
      api.sfx('score');
      placeFood();
    } else snake = snake.slice(0, -1);
  }

  function loop() {
    step();
    timer = setTimeout(loop, Math.max(55, 140 - score * 3));
  }

  const DIRS: Record<string, P> = {
    ArrowUp: [0, -1], w: [0, -1], W: [0, -1],
    ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
    ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0],
    ArrowRight: [1, 0], d: [1, 0], D: [1, 0],
  };

  function turn(d: P) {
    const last = queue[queue.length - 1] ?? dir;
    if (d[0] === -last[0] && d[1] === -last[1]) return; // no reversing
    if (d[0] === last[0] && d[1] === last[1]) return;
    if (queue.length < 3) queue.push(d);
  }

  let touch: { x: number; y: number } | null = null;
  function onTouchEnd(e: TouchEvent) {
    if (!touch) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.x;
    const dy = t.clientY - touch.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 20) turn(Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]);
    touch = null;
  }

  let off: () => void;
  onMount(() => {
    off = api.onKeyDown((e) => {
      const d = DIRS[e.key];
      if (d) turn(d);
    });
    placeFood();
    loop();
  });
  onDestroy(() => {
    off?.();
    if (timer) clearTimeout(timer);
  });
</script>

<div
  class="board"
  bind:clientWidth={w}
  bind:clientHeight={h}
  on:touchstart|passive={(e) => (touch = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
  on:touchend={onTouchEnd}
>
  <svg width={cols * CELL} height={rows * CELL} viewBox="0 0 {cols * CELL} {rows * CELL}">
    <rect class="field" x="0" y="0" width={cols * CELL} height={rows * CELL} rx="6" />
    <rect class="food" x={food[0] * CELL + 5} y={food[1] * CELL + 5} width={CELL - 10} height={CELL - 10} rx="3" />
    {#each snake as [x, y], i}
      <rect class:head={i === 0} class="seg" x={x * CELL + 1.5} y={y * CELL + 1.5} width={CELL - 3} height={CELL - 3} rx="4" />
    {/each}
  </svg>
</div>

<style>
  .board {
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    padding: 8px;
    touch-action: none;
  }
  .field {
    fill: color-mix(in srgb, var(--bg2) 25%, var(--bg1));
    stroke: var(--bg2);
  }
  .seg {
    fill: var(--t1);
  }
  .seg.head {
    fill: var(--hl1);
  }
  .food {
    fill: var(--t2);
  }
</style>
