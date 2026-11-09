<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { GameApi } from '../../core/types';
  import { clamp, fitCanvas, heldKeys, readPalette, startLoop, watchPalette, type Palette } from '../kit';
  import { newBall, stepBall, T } from './physics';

  export let paused = true;
  export let api: GameApi;

  const VW = 168;
  const VH = 96;

  // # brick  ^ spikes  o ring  = rubber (super bounce)  C checkpoint  E exit  P start
  const LEVELS = [
    [
      '##############################################################',
      '#............................................................#',
      '#............................................................#',
      '#.................o...................o...............o.....E#',
      '#................###.............o...###.............###.....#',
      '#..........o..........##........###.........o..........###...#',
      '#.........###.......................................=........#',
      '#.P.....##.........C........o..............C...#####.........#',
      '#####...........#######....###....##.....####..#...##...######',
      '#####^^^^^^^^^^^#######^^^^###^^^^##^^^^^####^^#^^^##^^^######',
      '##############################################################',
      '##############################################################',
    ],
    [
      '######################################################################',
      '#....................................................................#',
      '#..............o.................o..................o..............E.#',
      '#.............###...............###.........=......###.........#######',
      '#.....o...............o.....................#..........................#',
      '#....###.....=.......###.......o.......##...#....o.........o...........#',
      '#............#..............#####..........##...###...=...###..........#',
      '#.P..........#C....##..................C.........................##....#',
      '######.......####......##.......##...######.....##.....####......######',
      '######^^^^^^^####^^^^^^##^^^^^^^##^^^######^^^^^##^^^^^####^^^^^^######',
      '######################################################################',
      '######################################################################',
    ],
    [
      '################################################################################',
      '#..............................................................................#',
      '#.......o..................o.............o.....................o.............E.#',
      '#......###........=.......###...........###.............=.....###......#########',
      '#.................#..............o..............o.......#......................#',
      '#..o.........o....#....^.......#####..........#####.....#...o..........o.......#',
      '#.###.......###...#...###..............=...............##..###.......###.......#',
      '#P.........C......#........C...........#.......C...............C...............#',
      '#####...######...####....######....######...######....####....######....########',
      '#####^^^######^^^####^^^^######^^^^######^^^######^^^^####^^^^######^^^^########',
      '################################################################################',
      '################################################################################',
    ],
  ];

  let levelIndex = 0;
  let map: string[][] = [];
  let ringsLeft = 0;
  let spawn = { x: 0, y: 0 };
  const ball = newBall(0, 0);
  /** The jump key was held last frame (to spot a fresh press). */
  let upWas = false;
  let lives = 3;
  let score = 0;
  let camX = 0;
  let levelTime = 0;
  let message = '';
  let messageT = 0;
  let deadT = 0;
  let over = false;

  function load(i: number) {
    const rows = LEVELS[i];
    const width = Math.max(...rows.map((r) => r.length));
    map = rows.map((r) => r.padEnd(width, '#').split(''));
    ringsLeft = 0;
    map.forEach((row, y) =>
      row.forEach((c, x) => {
        if (c === 'o') ringsLeft++;
        if (c === 'P') {
          spawn = { x: x * T + T / 2, y: y * T + T / 2 };
          row[x] = '.';
        }
      }),
    );
    levelTime = 0;
    respawn();
    flash(`LEVEL ${i + 1} · collect ${ringsLeft} rings`);
  }

  function respawn() {
    Object.assign(ball, newBall(spawn.x, spawn.y));
    snapCamera();
  }

  function cameraTarget() {
    const worldW = (map[0]?.length ?? 0) * T;
    return clamp(ball.x - VW / 2, 0, Math.max(0, worldW - VW));
  }

  function snapCamera() {
    camX = cameraTarget();
  }

  function flash(text: string) {
    message = text;
    messageT = 2.2;
  }

  const tile = (tx: number, ty: number) => (ty < 0 ? '.' : map[ty]?.[tx] ?? '#');

  const keys = heldKeys(api);

  function die() {
    if (deadT > 0) return;
    api.sfx('hit');
    lives--;
    deadT = 0.8;
    if (lives <= 0) {
      over = true;
      api.gameOver(score, `level ${levelIndex + 1}`);
    }
  }

  function update(dt: number) {
    if (over) return;
    messageT = Math.max(0, messageT - dt);
    if (deadT > 0) {
      deadT -= dt;
      if (deadT <= 0 && !over) respawn();
      return;
    }
    levelTime += dt;
    const dir = ((keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0)) as -1 | 0 | 1;
    const up = keys.has('up');
    const events = stepBall(ball, { dir, up, upPressed: up && !upWas }, tile, dt);
    upWas = up;
    if (events.includes('jump') || events.includes('rubber')) api.sfx('blip');

    // touch special tiles
    const tx = Math.floor(ball.x / T);
    const ty = Math.floor(ball.y / T);
    for (let y = ty - 1; y <= ty + 1; y++)
      for (let x = tx - 1; x <= tx + 1; x++) {
        const c = tile(x, y);
        const cx = x * T + T / 2;
        const cy = y * T + T / 2;
        const near = Math.abs(ball.x - cx) < T / 2 + ball.r - 1 && Math.abs(ball.y - cy) < T / 2 + ball.r - 1;
        if (!near) continue;
        if (c === '^' && ball.y + ball.r > y * T + 3) die();
        else if (c === 'o') {
          map[y][x] = '.';
          ringsLeft--;
          score += 100;
          api.setScore(score);
          api.sfx('score');
          if (!ringsLeft) flash('exit is open');
        } else if (c === 'C' && (spawn.x !== cx || spawn.y !== cy)) {
          spawn = { x: cx, y: cy };
          flash('checkpoint');
        } else if (c === 'E') {
          if (ringsLeft > 0) {
            if (messageT <= 0) flash(`${ringsLeft} rings left`);
          } else {
            score += 500 + Math.max(0, Math.round(300 - levelTime * 3));
            api.setScore(score);
            api.sfx('win');
            if (levelIndex + 1 >= LEVELS.length) {
              over = true;
              api.gameOver(score, 'all levels cleared');
              return;
            }
            levelIndex++;
            load(levelIndex);
            return;
          }
        }
      }
    if (ball.y > map.length * T + 20) die();

    // The camera eases after the ball instead of being locked to it, so a
    // bump against a wall does not jerk the whole screen.
    camX += (cameraTarget() - camX) * Math.min(1, dt * 9);
  }

  /* ------------------------------------------------------------ drawing */

  let canvas: HTMLCanvasElement;
  let box: HTMLDivElement;
  let w = 0;
  let h = 0;
  let ctx: CanvasRenderingContext2D | null = null;
  let pal: Palette;
  $: if (canvas && w && h) ctx = fitCanvas(canvas, w, h, VW, VH);
  $: if (paused) keys.clear();

  function draw() {
    if (!ctx || !pal || !map.length) return;
    ctx.fillStyle = pal.bg1;
    ctx.fillRect(0, 0, VW, VH);
    const cx = Math.round(camX);
    const first = Math.floor(cx / T);
    for (let y = 0; y < map.length; y++)
      for (let x = first; x <= first + VW / T + 1; x++) {
        const c = tile(x, y);
        const px = x * T - cx;
        const py = y * T;
        if (c === '#') {
          ctx.fillStyle = pal.bg2;
          ctx.fillRect(px, py, T, T);
          ctx.fillStyle = pal.bg1;
          ctx.globalAlpha = 0.35;
          ctx.fillRect(px, py + (y % 2 ? 0 : 4), T, 0.6);
          ctx.fillRect(px + (y % 2 ? 2 : 6), py, 0.6, T);
          ctx.globalAlpha = 1;
        } else if (c === '=') {
          ctx.fillStyle = pal.hl1;
          ctx.globalAlpha = 0.6;
          ctx.fillRect(px, py + 2, T, T - 2);
          ctx.globalAlpha = 1;
          ctx.fillStyle = pal.t2;
          ctx.fillRect(px, py + 2, T, 1);
        } else if (c === '^') {
          ctx.fillStyle = pal.t1;
          ctx.beginPath();
          for (let k = 0; k < 2; k++) {
            ctx.moveTo(px + k * 4, py + T);
            ctx.lineTo(px + k * 4 + 2, py + 3);
            ctx.lineTo(px + k * 4 + 4, py + T);
          }
          ctx.fill();
        } else if (c === 'o') {
          ctx.strokeStyle = pal.t2;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.ellipse(px + T / 2, py + T / 2, 2.2, 4.6, 0, 0, Math.PI * 2);
          ctx.stroke();
        } else if (c === 'C') {
          const active = spawn.x === x * T + T / 2 && spawn.y === y * T + T / 2;
          ctx.fillStyle = active ? pal.hl1 : pal.t1;
          ctx.beginPath();
          ctx.moveTo(px + 4, py + 1);
          ctx.lineTo(px + 7, py + 4);
          ctx.lineTo(px + 4, py + 7);
          ctx.lineTo(px + 1, py + 4);
          ctx.fill();
        } else if (c === 'E') {
          ctx.strokeStyle = ringsLeft ? pal.t1 : pal.hl1;
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 0.5, py - T + 0.5, T - 1, T * 2 - 1);
          if (ringsLeft) for (let k = 2; k < T; k += 2) ctx.fillRect(px + k, py - T + 1, 0.7, T * 2 - 2);
        }
      }
    // ball
    if (deadT <= 0 || Math.floor(deadT * 12) % 2 === 0) {
      const bx = ball.x - cx;
      ctx.fillStyle = pal.hl1;
      ctx.beginPath();
      ctx.arc(bx, ball.y, ball.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pal.t2;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(bx - 1, ball.y - 1.2, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // HUD
    ctx.font = '6px "JetBrains Mono", monospace';
    ctx.fillStyle = pal.hl1;
    for (let i = 0; i < lives; i++) {
      ctx.beginPath();
      ctx.arc(5 + i * 7, 5, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = pal.t2;
    ctx.fillText(`rings ${ringsLeft}`, 30, 7);
    ctx.fillText(`L${levelIndex + 1}  ${score}`, VW - 52, 7);
    if (messageT > 0) {
      ctx.textAlign = 'center';
      ctx.fillStyle = pal.hl1;
      ctx.font = 'bold 7px "JetBrains Mono", monospace';
      ctx.fillText(message, VW / 2, 18);
      ctx.textAlign = 'left';
    }
  }

  let stopLoop: () => void;
  let stopPal: () => void;
  onMount(() => {
    load(0);
    pal = readPalette(box);
    stopPal = watchPalette(box, (p) => (pal = p));
    stopLoop = startLoop(update, draw, () => paused || over);
  });
  onDestroy(() => {
    stopLoop?.();
    stopPal?.();
    keys.stop();
  });
</script>

<div class="box" bind:this={box} bind:clientWidth={w} bind:clientHeight={h}>
  <canvas bind:this={canvas} />
</div>

<style>
  .box {
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    overflow: hidden;
  }
</style>
