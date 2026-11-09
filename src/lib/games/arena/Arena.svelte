<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { GameApi } from '../../core/types';
  import { clamp, fitCanvas, heldKeys, mix, readPalette, startLoop, watchPalette, type Palette } from '../kit';
  import { addSnake, ARENA_R, leaderboard, newWorld, radius, stepWorld, type Snake } from './engine';

  export let paused = true;
  export let api: GameApi;

  const VW = 240;
  const VH = 150;

  const world = newWorld();
  let me: Snake = addSnake(world, false, 10, 'you');
  let over = false;
  let score = 0;
  let kills = 0;
  let zoom = 1.3;
  let flash = '';
  let flashT = 0;
  let eatSound = 0;

  /* -------------------------------------------------------------- input */

  /** Pointer steering: the direction from the middle of the screen to the pointer. */
  let aim: number | null = null;
  let pointerBoost = false;
  const keys = heldKeys(api, (k) => {
    if (k === 'left' || k === 'right') aim = null; // keys take over from the pointer
  });

  function update(dt: number) {
    if (over) return;
    const turn = ((keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0)) as -1 | 0 | 1;
    stepWorld(world, dt, { turn, aim: turn ? null : aim, boost: keys.has('up') || pointerBoost });
    for (const e of world.events) {
      if (e.kind === 'kill' && e.snake === me.id) {
        kills++;
        const victim = world.snakes.find((s) => s.id === e.other);
        flash = `you cut off ${victim?.name ?? 'a snake'}`;
        flashT = 1.6;
        api.sfx('score');
      } else if (e.kind === 'eat' && e.snake === me.id && eatSound <= 0) {
        api.sfx('blip');
        eatSound = 0.12;
      }
    }
    eatSound -= dt;
    flashT = Math.max(0, flashT - dt);
    if (!me.alive) {
      over = true;
      const by = world.snakes.find((s) => s.id === me.killedBy);
      api.gameOver(score, `${me.cause === 'wall' ? 'hit the edge' : `cut off by ${by?.name ?? 'a snake'}`} · ${kills} ${kills === 1 ? 'kill' : 'kills'}`);
      return;
    }
    const s = Math.floor(me.mass);
    if (s > score) {
      score = s;
      api.setScore(score);
    }
    // zoom out as you grow
    const want = clamp(1.35 - Math.sqrt(me.mass) * 0.035, 0.55, 1.35);
    zoom += (want - zoom) * Math.min(1, dt * 2);
  }

  /* ------------------------------------------------------------ drawing */

  let canvas: HTMLCanvasElement;
  let box: HTMLDivElement;
  let w = 0;
  let h = 0;
  let ctx: CanvasRenderingContext2D | null = null;
  let pal: Palette;
  $: if (canvas && w && h) ctx = fitCanvas(canvas, w, h, VW, VH);
  $: if (paused) {
    keys.clear();
    pointerBoost = false;
  }

  function onPointerMove(e: PointerEvent) {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left - r.width / 2;
    const y = e.clientY - r.top - r.height / 2;
    if (Math.hypot(x, y) > 6) aim = Math.atan2(y, x);
  }

  /** Other snakes: shades of the theme, none of them your accent. */
  const tones = (p: Palette) => [p.t2, p.t1, mix(p.t1, p.t2, 0.5), mix(p.t2, p.bg2, 0.35), mix(p.t1, p.bg1, 0.25)];

  function drawSnake(s: Snake, cam: { x: number; y: number }, color: string) {
    if (!ctx) return;
    const r = radius(s);
    const toX = (x: number) => (x - cam.x) * zoom + VW / 2;
    const toY = (y: number) => (y - cam.y) * zoom + VH / 2;
    const dark = mix(color, pal.bg1, 0.3);
    if (s.boost) {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = color;
      for (let i = s.body.length - 1; i >= 0; i -= 2) {
        const p = s.body[i];
        ctx.beginPath();
        ctx.arc(toX(p.x), toY(p.y), (r + 2) * zoom, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    for (let i = s.body.length - 1; i >= 0; i--) {
      const p = s.body[i];
      const x = toX(p.x);
      const y = toY(p.y);
      if (x < -20 || y < -20 || x > VW + 20 || y > VH + 20) continue;
      ctx.fillStyle = Math.floor(i / 3) % 2 ? dark : color;
      ctx.beginPath();
      ctx.arc(x, y, r * zoom, 0, Math.PI * 2);
      ctx.fill();
    }
    // eyes
    const hd = s.body[0];
    const hx = toX(hd.x);
    const hy = toY(hd.y);
    for (const side of [-1, 1]) {
      const ex = hx + (Math.cos(s.angle) * r * 0.45 + Math.cos(s.angle + Math.PI / 2) * side * r * 0.5) * zoom;
      const ey = hy + (Math.sin(s.angle) * r * 0.45 + Math.sin(s.angle + Math.PI / 2) * side * r * 0.5) * zoom;
      ctx.fillStyle = pal.bg1;
      ctx.beginPath();
      ctx.arc(ex, ey, r * 0.38 * zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pal.t2;
      ctx.beginPath();
      ctx.arc(ex + Math.cos(s.angle) * r * 0.14 * zoom, ey + Math.sin(s.angle) * r * 0.14 * zoom, r * 0.17 * zoom, 0, Math.PI * 2);
      ctx.fill();
    }
    if (s.bot) {
      ctx.font = '5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = pal.t1;
      ctx.fillText(s.name, hx, hy - (r + 4) * zoom);
      ctx.textAlign = 'left';
    }
  }

  function draw() {
    if (!ctx || !pal) return;
    const cam = me.body[0];
    ctx.fillStyle = pal.bg1;
    ctx.fillRect(0, 0, VW, VH);
    // outside the arena
    ctx.save();
    ctx.fillStyle = pal.bg2;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(0, 0, VW, VH);
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc((0 - cam.x) * zoom + VW / 2, (0 - cam.y) * zoom + VH / 2, ARENA_R * zoom, 0, Math.PI * 2);
    ctx.fillStyle = pal.bg1;
    ctx.fill();
    ctx.strokeStyle = pal.hl1;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.clip();
    // dot grid, so movement reads
    const step = 30;
    ctx.fillStyle = pal.bg2;
    const x0 = Math.floor((cam.x - VW / 2 / zoom) / step) * step;
    const y0 = Math.floor((cam.y - VH / 2 / zoom) / step) * step;
    for (let gx = x0; gx < cam.x + VW / 2 / zoom + step; gx += step)
      for (let gy = y0; gy < cam.y + VH / 2 / zoom + step; gy += step) ctx.fillRect((gx - cam.x) * zoom + VW / 2, (gy - cam.y) * zoom + VH / 2, 1, 1);
    // food
    const pulse = 0.75 + Math.sin(world.time * 4) * 0.25;
    for (const f of world.food) {
      const x = (f.x - cam.x) * zoom + VW / 2;
      const y = (f.y - cam.y) * zoom + VH / 2;
      if (x < -4 || y < -4 || x > VW + 4 || y > VH + 4) continue;
      ctx.fillStyle = f.rich ? pal.t2 : pal.t1;
      ctx.globalAlpha = f.rich ? pulse : 0.8;
      ctx.beginPath();
      ctx.arc(x, y, (f.rich ? 1.8 : 1.1) * zoom + 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // snakes, you on top
    const shades = tones(pal);
    for (const s of world.snakes) if (s.alive && s !== me) drawSnake(s, cam, shades[s.tone]);
    if (me.alive || over) drawSnake(me, cam, pal.hl1);
    ctx.restore();

    // HUD: your length, the leaderboard, a minimap
    ctx.font = '6px "JetBrains Mono", monospace';
    ctx.fillStyle = pal.t2;
    ctx.fillText(`length ${Math.floor(me.mass)}  kills ${kills}`, 4, 8);
    const board = leaderboard(world).slice(0, 5);
    const rank = leaderboard(world).indexOf(me) + 1;
    ctx.textAlign = 'right';
    board.forEach((s, i) => {
      ctx!.fillStyle = s === me ? pal.hl1 : pal.t1;
      ctx!.fillText(`${i + 1}. ${s.name} ${Math.floor(s.mass)}`, VW - 4, 8 + i * 7);
    });
    if (rank > 5 && me.alive) {
      ctx.fillStyle = pal.hl1;
      ctx.fillText(`${rank}. you ${Math.floor(me.mass)}`, VW - 4, 8 + 5 * 7);
    }
    ctx.textAlign = 'left';
    const mr = 16;
    const mx = VW - mr - 4;
    const my = VH - mr - 4;
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = pal.t1;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    for (const s of world.snakes) {
      if (!s.alive) continue;
      ctx.fillStyle = s === me ? pal.hl1 : pal.t1;
      const p = s.body[0];
      ctx.fillRect(mx + (p.x / ARENA_R) * mr - (s === me ? 1 : 0.5), my + (p.y / ARENA_R) * mr - (s === me ? 1 : 0.5), s === me ? 2 : 1, s === me ? 2 : 1);
    }
    if (flashT > 0) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 7px "JetBrains Mono", monospace';
      ctx.fillStyle = pal.hl1;
      ctx.globalAlpha = Math.min(1, flashT * 2);
      ctx.fillText(flash, VW / 2, 20);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    }
  }

  let stopLoop: () => void;
  let stopPal: () => void;
  onMount(() => {
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
  <canvas
    bind:this={canvas}
    on:pointermove={onPointerMove}
    on:pointerdown={(e) => {
      onPointerMove(e);
      if (e.pointerType === 'mouse') pointerBoost = true;
    }}
    on:pointerup={() => (pointerBoost = false)}
    on:pointerleave={() => (pointerBoost = false)}
  />
</div>

<style>
  .box {
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    overflow: hidden;
  }
  canvas {
    cursor: crosshair;
    touch-action: none;
  }
</style>
