<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { GameApi } from '../../core/types';
  import { clamp, fitCanvas, heldKeys, mix, rand, readPalette, startLoop, watchPalette, type Palette } from '../kit';
  import { CAR_H, lanePos, LANES, newTraffic, spawn, stepTraffic, type Car } from './traffic';

  export let paused = true;
  export let api: GameApi;

  const VW = 128;
  const VH = 168;
  const ROAD = 66;
  const PY = 134; // player screen y
  const CAR_W = 9;

  // road centre for a world distance: gentle curves that get wilder further on
  const centre = (d: number) => VW / 2 + Math.sin(d / 520) * 22 + Math.sin(d / 170) * 6 * Math.min(1, d / 6000);
  /** Screen x of a lane (fractional lanes are between two lanes). */
  const laneX = (d: number, lane: number) => centre(d) - ROAD / 2 + (ROAD / LANES) * (lane + 0.5);

  // Other cars: five shades from the theme, none of them the player's accent.
  const trafficTones = (p: Palette) => [p.t1, p.t2, mix(p.t1, p.t2, 0.5), mix(p.t1, p.bg2, 0.5), mix(p.t2, p.bg2, 0.5)];

  interface Can { d: number; lane: number; kind: 'fuel' | 'nitro' }

  let dist = 0;
  let speed = 0;
  let x = VW / 2;
  let fuel = 100;
  let nitro = 0;
  let lives = 3;
  let crashT = 0;
  let invuln = 0;
  let score = 0;
  let overtakes = 0;
  const traffic = newTraffic();
  let cans: Can[] = [];
  let spawnT = 0;
  let canT = 6;
  let shake = 0;
  let over = false;

  const keys = heldKeys(api);
  $: level = 1 + Math.floor(dist / 4000);
  $: maxSpeed = 95 + level * 8 + (nitro > 0 ? 45 : 0);

  function crash() {
    if (invuln > 0 || crashT > 0) return;
    api.sfx('hit');
    lives--;
    crashT = 1.1;
    shake = 0.5;
    speed = 0;
    if (lives <= 0) {
      over = true;
      api.gameOver(score, `${Math.round(dist / 10)} m · ${overtakes} overtakes`);
    }
  }

  function update(dt: number) {
    if (over) return;
    shake = Math.max(0, shake - dt);
    invuln = Math.max(0, invuln - dt);
    nitro = Math.max(0, nitro - dt);
    if (crashT > 0) {
      crashT -= dt;
      if (crashT <= 0) {
        x = centre(dist);
        invuln = 2;
        traffic.cars = traffic.cars.filter((c) => Math.abs(c.d - dist) > 60);
      }
      return;
    }

    // throttle: w accelerates, s brakes, otherwise coast
    if (keys.has('up')) speed += 70 * dt;
    else if (keys.has('down')) speed -= 120 * dt;
    else speed -= 18 * dt;
    const roadC = centre(dist);
    const off = Math.abs(x - roadC) > ROAD / 2 - CAR_W / 2;
    const cap = off ? 45 : maxSpeed;
    speed = clamp(speed, 0, Math.max(cap, speed - 90 * dt));
    if (off && speed > 45) speed -= 120 * dt;

    // steering scales a little with speed, the road curve pushes you outwards
    const steer = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
    x += steer * (40 + speed * 0.35) * dt;
    const curve = centre(dist + 4) - roadC;
    x -= curve * 0.25;
    if (Math.abs(x - roadC) > ROAD / 2 + 16) crash();
    x = clamp(x, 6, VW - 6);

    dist += speed * dt;
    fuel -= dt * (1.4 + speed / 160);
    if (fuel <= 0) {
      fuel = 0;
      over = true;
      api.gameOver(score, 'out of fuel');
      return;
    }

    // traffic
    spawnT -= dt;
    if (spawnT <= 0) {
      spawnT = Math.max(0.45, 1.6 - level * 0.12) * rand(0.7, 1.3);
      const ahead = speed > 30 || Math.random() < 0.5;
      // spawn() picks a lane that is clear and keeps a way through, or adds nothing
      const added = spawn(traffic, dist + (ahead ? VH + 20 : -60), rand(35, 70 + level * 4), Math.floor(rand(0, 5)));
      if (!added) spawnT = 0.25; // no safe lane right now: try again soon, so traffic stays busy
    }
    canT -= dt;
    if (canT <= 0) {
      canT = rand(7, 11);
      cans.push({ d: dist + VH + 10, lane: Math.floor(rand(0, LANES)), kind: Math.random() < 0.7 ? 'fuel' : 'nitro' });
    }

    stepTraffic(traffic, dt, level);
    for (const c of traffic.cars) {
      const cy = PY - (c.d - dist);
      const cx = laneX(c.d, lanePos(c));
      if (!c.passed && c.d < dist - CAR_H) {
        c.passed = true;
        overtakes++;
        api.sfx('blip');
      }
      if (invuln <= 0 && Math.abs(cy - PY) < CAR_H - 1 && Math.abs(cx - x) < CAR_W - 1) crash();
    }
    for (const can of cans) {
      const cy = PY - (can.d - dist);
      const cx = laneX(can.d, can.lane);
      if (Math.abs(cy - PY) < CAR_H / 2 + 3 && Math.abs(cx - x) < CAR_W / 2 + 3) {
        if (can.kind === 'fuel') fuel = Math.min(100, fuel + 35);
        else nitro = 4;
        can.d = -1e9;
        api.sfx('score');
      }
    }
    traffic.cars = traffic.cars.filter((c) => c.d > dist - 200 && c.d < dist + 400);
    cans = cans.filter((c) => c.d > dist - 40);

    const s = Math.floor(dist / 10) + overtakes * 25;
    if (s !== score) {
      score = s;
      api.setScore(score);
    }
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

  function car(px: number, py: number, color: string, alpha = 1) {
    if (!ctx) return;
    ctx.globalAlpha = alpha;
    const l = Math.round(px - CAR_W / 2);
    const t = Math.round(py - CAR_H / 2);
    ctx.fillStyle = pal.bg2;
    ctx.fillRect(l - 1, t + 2, 2, 4);
    ctx.fillRect(l + CAR_W - 1, t + 2, 2, 4);
    ctx.fillRect(l - 1, t + CAR_H - 6, 2, 4);
    ctx.fillRect(l + CAR_W - 1, t + CAR_H - 6, 2, 4);
    ctx.fillStyle = color;
    ctx.fillRect(l, t, CAR_W, CAR_H);
    ctx.fillStyle = pal.bg1;
    ctx.fillRect(l + 1, t + 3, CAR_W - 2, 3);
    ctx.fillRect(l + 1, t + CAR_H - 5, CAR_W - 2, 2);
    ctx.globalAlpha = 1;
  }

  /** A blinking turn signal on the side the car is moving to, from the first blink until it is in the lane. */
  function indicator(c: Car, cx: number, cy: number) {
    if (!ctx || c.target === c.lane) return;
    if (Math.floor(performance.now() / 180) % 2) return;
    const side = c.target > c.lane ? 1 : -1;
    const l = Math.round(cx - CAR_W / 2);
    const ex = side > 0 ? l + CAR_W + 1 : l - 3; // just outside the wheels
    const top = Math.round(cy - CAR_H / 2);
    ctx.fillStyle = pal.hl1;
    ctx.fillRect(ex, top, 2, 2);
    ctx.fillRect(ex, top + CAR_H - 2, 2, 2);
    // a soft glow so it reads at a glance
    ctx.globalAlpha = 0.35;
    ctx.fillRect(ex + side, top - 1, 2, 4);
    ctx.fillRect(ex + side, top + CAR_H - 3, 2, 4);
    ctx.globalAlpha = 1;
  }

  function draw() {
    if (!ctx || !pal) return;
    ctx.save();
    if (shake > 0) ctx.translate(rand(-2, 2) * shake * 2, rand(-2, 2) * shake * 2);
    ctx.fillStyle = pal.bg1;
    ctx.fillRect(-4, -4, VW + 8, VH + 8);
    for (let y = 0; y < VH; y += 2) {
      const d = dist + (PY - y);
      const c = centre(d);
      const stripe = Math.floor(d / 24) % 2 === 0;
      ctx.fillStyle = pal.bg2;
      ctx.globalAlpha = stripe ? 0.45 : 0.3;
      ctx.fillRect(0, y, VW, 2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = pal.bg1;
      ctx.fillRect(c - ROAD / 2, y, ROAD, 2);
      ctx.fillStyle = stripe ? pal.hl1 : pal.t2;
      ctx.fillRect(c - ROAD / 2 - 2, y, 2, 2);
      ctx.fillRect(c + ROAD / 2, y, 2, 2);
      if (Math.floor(d / 14) % 2 === 0) {
        ctx.fillStyle = pal.t1;
        for (let l = 1; l < LANES; l++) ctx.fillRect(c - ROAD / 2 + (ROAD / LANES) * l - 0.5, y, 1, 2);
      }
    }
    for (const can of cans) {
      const cy = PY - (can.d - dist);
      if (cy < -10 || cy > VH + 10) continue;
      const cx = laneX(can.d, can.lane);
      ctx.fillStyle = can.kind === 'fuel' ? pal.t2 : pal.hl1;
      ctx.fillRect(cx - 3, cy - 4, 6, 8);
      ctx.fillStyle = pal.bg1;
      ctx.font = 'bold 5px "JetBrains Mono", monospace';
      ctx.fillText(can.kind === 'fuel' ? 'F' : 'N', cx - 1.5, cy + 2);
    }
    const tones = trafficTones(pal);
    for (const c of traffic.cars) {
      const cy = PY - (c.d - dist);
      if (cy <= -20 || cy >= VH + 20) continue;
      const cx = laneX(c.d, lanePos(c));
      car(cx, cy, tones[c.tone]);
      indicator(c, cx, cy);
    }
    if (!over) car(x, PY, pal.hl1, crashT > 0 || (invuln > 0 && Math.floor(invuln * 10) % 2) ? 0.4 : 1);
    if (nitro > 0) {
      ctx.fillStyle = pal.t1;
      ctx.fillRect(x - 2, PY + CAR_H / 2, 4, rand(2, 6));
    }
    ctx.restore();

    // HUD
    ctx.fillStyle = pal.bg1;
    ctx.globalAlpha = 0.75;
    ctx.fillRect(0, 0, VW, 11);
    ctx.globalAlpha = 1;
    ctx.font = '6px "JetBrains Mono", monospace';
    ctx.fillStyle = pal.t2;
    ctx.fillText(`${Math.round(speed * 1.6)} km/h`, 3, 8);
    ctx.fillText(`L${level}`, 46, 8);
    ctx.fillStyle = pal.hl1;
    for (let i = 0; i < lives; i++) ctx.fillRect(60 + i * 5, 4, 3, 4);
    ctx.fillStyle = pal.t1;
    ctx.fillText('F', 80, 8);
    ctx.strokeStyle = pal.t1;
    ctx.strokeRect(85.5, 3.5, 38, 5);
    ctx.fillStyle = fuel < 25 ? pal.hl1 : pal.t2;
    ctx.fillRect(86, 4, (37 * fuel) / 100, 4);
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
