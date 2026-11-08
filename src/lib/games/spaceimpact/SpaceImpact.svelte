<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { GameApi } from '../../core/types';
  import { clamp, drawSprite, fitCanvas, heldKeys, rand, readPalette, startLoop, watchPalette, type Palette } from '../kit';

  export let paused = true;
  export let api: GameApi;

  const VW = 192;
  const VH = 108;

  const SHIP = ['##........', '####......', '.######...', '##########', '.######...', '####......', '##........'];
  const ENEMIES = [
    ['..####..', '.#.##.#.', '########', '#.####.#', '..#..#..'],
    ['...###', '.#####', '###.##', '.#####', '...###'],
    ['#....#', '.####.', '##..##', '.####.', '#....#'],
    ['..##..', '.####.', '##.###', '######', '.#..#.', '#....#'],
  ];
  const BOSS = [
    '.......#######......',
    '.....###########....',
    '...######...#####...',
    '..#####.......####..',
    '.####...#####..###..',
    '#####..#######..###.',
    '####..###...###.####',
    '####..###...###.####',
    '#####..#######..###.',
    '.####...#####..###..',
    '..#####.......####..',
    '...######...#####...',
    '.....###########....',
    '.......#######......',
  ];

  interface Ent { x: number; y: number; w: number; h: number; vx: number; vy: number; hp: number; kind: number; t: number; baseY: number; fire: number; pattern: string }
  interface Shot { x: number; y: number; vx: number; vy: number }
  interface Item { x: number; y: number; type: 'life' | 'rapid' | 'triple' }
  interface Spark { x: number; y: number; vx: number; vy: number; life: number }

  const player = { x: 14, y: VH / 2 - 3, w: 10, h: 7 };
  let lives = 3;
  let invuln = 2;
  let score = 0;
  let level = 1;
  let kills = 0;
  let cooldown = 0;
  let rapid = 0;
  let triple = 0;
  let enemies: Ent[] = [];
  let shots: Shot[] = [];
  let enemyShots: Shot[] = [];
  let items: Item[] = [];
  let sparks: Spark[] = [];
  let boss: (Ent & { max: number }) | null = null;
  let waveTimer = 1;
  let banner = 'LEVEL 1';
  let bannerT = 2;
  let over = false;
  const stars = Array.from({ length: 50 }, () => ({ x: rand(0, VW), y: rand(0, VH), s: rand(8, 40) }));

  const keys = heldKeys(api, (k, e) => {
    if (k === 'KeyJ' || k === 'KeyK' || k === 'Enter' || k === 'KeyX') e.preventDefault();
  });
  const firing = () => keys.has('KeyJ') || keys.has('KeyK') || keys.has('KeyX') || keys.has('Enter');

  const hit = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w?: number; h?: number }) =>
    b.x < a.x + a.w && b.x + (b.w ?? 2) > a.x && b.y < a.y + a.h && b.y + (b.h ?? 1) > a.y;

  function boom(x: number, y: number, n = 10) {
    for (let i = 0; i < n; i++) sparks.push({ x, y, vx: rand(-50, 50), vy: rand(-50, 50), life: rand(0.2, 0.6) });
  }

  function addScore(n: number) {
    score += n;
    api.setScore(score);
  }

  function spawnWave() {
    const pattern = ['line', 'sine', 'dive', 'shooter', 'sine'][Math.floor(rand(0, Math.min(5, 2 + level)))];
    const n = 3 + Math.floor(rand(0, 2 + level));
    const y0 = rand(12, VH - 20);
    const speed = 28 + level * 6;
    for (let i = 0; i < n; i++) {
      const kind = Math.floor(rand(0, ENEMIES.length));
      const spr = ENEMIES[kind];
      const y = pattern === 'line' ? rand(8, VH - 14) : y0;
      enemies.push({
        x: VW + 4 + i * 16, y, baseY: y, w: spr[0].length, h: spr.length,
        vx: -speed, vy: 0, hp: pattern === 'shooter' ? 2 : 1 + (level > 3 && Math.random() < 0.3 ? 1 : 0),
        kind, t: i * 0.4, fire: rand(1, 2.5), pattern,
      });
    }
  }

  function spawnBoss() {
    const max = 30 + level * 12;
    boss = { x: VW + 4, y: VH / 2 - 7, baseY: VH / 2 - 7, w: 20, h: 14, vx: -20, vy: 0, hp: max, max, kind: 0, t: 0, fire: 1.5, pattern: 'boss' };
    banner = 'WARNING: BOSS';
    bannerT = 2;
  }

  function damagePlayer() {
    if (invuln > 0) return;
    lives--;
    boom(player.x + 5, player.y + 3, 18);
    api.sfx('hit');
    invuln = 2;
    if (lives <= 0) {
      over = true;
      api.gameOver(score, `reached level ${level}`);
    }
  }

  function update(dt: number) {
    if (over) return;
    if (bannerT > 0) bannerT -= dt;
    invuln = Math.max(0, invuln - dt);
    rapid = Math.max(0, rapid - dt);
    triple = Math.max(0, triple - dt);

    // movement
    const sp = 72;
    const dx = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
    const dy = (keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0);
    player.x = clamp(player.x + dx * sp * dt, 2, VW * 0.6);
    player.y = clamp(player.y + dy * sp * dt, 8, VH - player.h - 1);

    // shooting
    cooldown -= dt;
    if (firing() && cooldown <= 0) {
      cooldown = rapid > 0 ? 0.09 : 0.18;
      const sx = player.x + 10;
      const sy = player.y + 3;
      shots.push({ x: sx, y: sy, vx: 170, vy: 0 });
      if (triple > 0) {
        shots.push({ x: sx, y: sy, vx: 165, vy: -35 }, { x: sx, y: sy, vx: 165, vy: 35 });
      }
      api.sfx('blip');
    }

    for (const s of stars) {
      s.x -= s.s * dt;
      if (s.x < 0) {
        s.x = VW;
        s.y = rand(0, VH);
      }
    }

    // waves and bosses
    if (!boss) {
      waveTimer -= dt;
      if (kills >= 20 + level * 5 && enemies.length === 0) spawnBoss();
      else if (waveTimer <= 0 && kills < 20 + level * 5) {
        spawnWave();
        waveTimer = Math.max(1.4, 3.2 - level * 0.25);
      }
    }

    for (const e of enemies) {
      e.t += dt;
      e.x += e.vx * dt;
      if (e.pattern === 'sine') e.y = e.baseY + Math.sin(e.t * 3) * 14;
      if (e.pattern === 'dive' && e.x < VW - 30) e.y += clamp(player.y - e.y, -1, 1) * 30 * dt;
      e.y = clamp(e.y, 8, VH - e.h);
      if (e.pattern === 'shooter' || level > 2) {
        e.fire -= dt;
        if (e.fire <= 0 && e.x < VW - 10 && e.x > player.x + 20) {
          e.fire = rand(1.4, 3) / (1 + level * 0.1);
          const ang = Math.atan2(player.y + 3 - e.y, player.x - e.x);
          enemyShots.push({ x: e.x, y: e.y + e.h / 2, vx: Math.cos(ang) * 60, vy: Math.sin(ang) * 60 });
        }
      }
      if (hit(e, player) || hit(player, e)) {
        e.hp = 0;
        boom(e.x, e.y);
        damagePlayer();
      }
    }

    if (boss) {
      boss.t += dt;
      if (boss.x > VW - 30) boss.x += boss.vx * dt;
      boss.y = boss.baseY + Math.sin(boss.t * 1.2) * (VH / 2 - 14);
      boss.fire -= dt;
      if (boss.fire <= 0) {
        boss.fire = Math.max(0.5, 1.4 - level * 0.1);
        for (let a = -2; a <= 2; a++) enemyShots.push({ x: boss.x, y: boss.y + 7, vx: -70, vy: a * 18 });
        api.sfx('blip');
      }
      if (hit(boss, player)) damagePlayer();
    }

    // player shots
    for (const s of shots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      for (const e of enemies) {
        if (e.hp > 0 && hit(e, { x: s.x, y: s.y, w: 4, h: 1 })) {
          e.hp--;
          s.x = VW + 99;
          if (e.hp <= 0) {
            kills++;
            addScore(10 * level);
            boom(e.x + e.w / 2, e.y + e.h / 2);
            api.sfx('score');
            if (Math.random() < 0.08) items.push({ x: e.x, y: e.y, type: (['life', 'rapid', 'triple', 'rapid', 'triple'] as const)[Math.floor(rand(0, 5))] });
          }
        }
      }
      if (boss && hit(boss, { x: s.x, y: s.y, w: 4, h: 1 })) {
        boss.hp--;
        boom(s.x, s.y, 2);
        s.x = VW + 99;
        if (boss.hp <= 0) {
          boom(boss.x + 10, boss.y + 7, 50);
          addScore(300 * level);
          api.sfx('win');
          boss = null;
          level++;
          kills = 0;
          banner = `LEVEL ${level}`;
          bannerT = 2;
          if (lives < 5) lives++;
        }
      }
    }

    for (const s of enemyShots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (hit(player, { x: s.x, y: s.y, w: 2, h: 2 })) {
        s.x = -99;
        damagePlayer();
      }
    }

    for (const it of items) {
      it.x -= 25 * dt;
      if (hit(player, { x: it.x, y: it.y, w: 6, h: 6 })) {
        if (it.type === 'life') lives = Math.min(5, lives + 1);
        if (it.type === 'rapid') rapid = 10;
        if (it.type === 'triple') triple = 10;
        it.x = -99;
        api.sfx('score');
      }
    }

    for (const p of sparks) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }

    enemies = enemies.filter((e) => e.hp > 0 && e.x > -20);
    shots = shots.filter((s) => s.x < VW + 5 && s.y > 0 && s.y < VH);
    enemyShots = enemyShots.filter((s) => s.x > -5 && s.x < VW + 5 && s.y > -5 && s.y < VH + 5);
    items = items.filter((i) => i.x > -10);
    sparks = sparks.filter((p) => p.life > 0);
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
    if (!ctx || !pal) return;
    ctx.fillStyle = pal.bg1;
    ctx.fillRect(0, 0, VW, VH);
    for (const s of stars) {
      ctx.globalAlpha = s.s / 50;
      ctx.fillStyle = pal.t1;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), s.s > 30 ? 2 : 1, 1);
    }
    ctx.globalAlpha = 1;
    for (const e of enemies) drawSprite(ctx, ENEMIES[e.kind], Math.round(e.x), Math.round(e.y), e.hp > 1 ? pal.hl1 : pal.t2);
    if (boss) {
      drawSprite(ctx, BOSS, Math.round(boss.x), Math.round(boss.y), pal.hl1);
      ctx.fillStyle = pal.bg2;
      ctx.fillRect(VW / 2 - 40, 3, 80, 2);
      ctx.fillStyle = pal.hl1;
      ctx.fillRect(VW / 2 - 40, 3, (80 * boss.hp) / boss.max, 2);
    }
    if (!over && (invuln <= 0 || Math.floor(invuln * 10) % 2 === 0)) drawSprite(ctx, SHIP, Math.round(player.x), Math.round(player.y), pal.t2);
    ctx.fillStyle = pal.hl1;
    for (const s of shots) ctx.fillRect(Math.round(s.x), Math.round(s.y), 4, 1);
    ctx.fillStyle = pal.t2;
    for (const s of enemyShots) ctx.fillRect(Math.round(s.x), Math.round(s.y), 2, 2);
    for (const it of items) {
      ctx.strokeStyle = pal.hl1;
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(it.x) + 0.5, Math.round(it.y) + 0.5, 6, 6);
      ctx.fillStyle = pal.t2;
      ctx.font = '5px "JetBrains Mono", monospace';
      ctx.fillText(it.type === 'life' ? '+' : it.type === 'rapid' ? 'R' : 'T', Math.round(it.x) + 2, Math.round(it.y) + 5.5);
    }
    for (const p of sparks) {
      ctx.globalAlpha = Math.min(1, p.life * 3);
      ctx.fillStyle = pal.hl1;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    }
    ctx.globalAlpha = 1;
    // HUD
    ctx.fillStyle = pal.t2;
    for (let i = 0; i < lives; i++) ctx.fillRect(3 + i * 6, 2, 4, 3);
    ctx.font = '6px "JetBrains Mono", monospace';
    ctx.fillStyle = pal.t1;
    ctx.fillText(`L${level}`, VW - 40, 6);
    ctx.fillStyle = pal.t2;
    ctx.fillText(String(score).padStart(5, '0'), VW - 28, 6);
    if (rapid > 0 || triple > 0) {
      ctx.fillStyle = pal.hl1;
      ctx.fillText(`${rapid > 0 ? 'RAPID ' : ''}${triple > 0 ? 'TRIPLE' : ''}`, 36, 6);
    }
    if (bannerT > 0) {
      ctx.fillStyle = pal.hl1;
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(banner, VW / 2, VH / 2);
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
