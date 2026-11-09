import { drawSprite, type Palette } from '../kit';
import { BLOCK, BLOCK_H, GROUND_Y, HERO_X, PX_PER_M, VH, VW, type Obstacle, type Pickup, type RunnerWorld } from './world';

/** Renders a RunnerWorld in virtual pixels. Every colour comes from the theme palette. */

type Ctx = CanvasRenderingContext2D;

const FONT = '"JetBrains Mono", ui-monospace, monospace';

// the hero: a block cursor on little legs
const LEGS_RUN = [
  ['.#...#.', '#.....#'],
  ['..#.#..', '..#.#..'],
];
const LEGS_AIR = ['.##.##.'];
const LEGS_DUCK = [['.#.....#.'], ['..#...#..']];

const BUG_BODY = ['.#........', '..#.####..', '.##.#####.', '##########', '.#########'];
const BUG_LEGS = [['..#..#..#.'], ['.#..#..#..']];
const BRACE_L = ['.##', '.#.', '#..', '.#.', '.##'];
const BRACE_R = ['##.', '.#.', '..#', '.#.', '##.'];
const COIN = ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'];

const SNIPPETS = [
  'fn run(dt) {',
  'let speed = 72;',
  'if (bug) jump();',
  'while (alive) step();',
  'return ok;',
  'mov r1, #0x2a',
  'jmp .loop',
  '} else {',
  'await frame();',
  'x -= v * dt;',
  '// TODO: duck',
  'push {lr}',
  'coins += 1;',
  'export default run;',
  'for b in bits:',
  'catch (e) { retry(); }',
  'null ?? fallback',
  'echo $PATH',
  '0xC0FFEE',
  'git commit -am "wip"',
  'const gap = 0;',
  'yield next;',
];

const BITS = Array.from({ length: 64 }, (_, i) => ((i * 7 + (i >> 2)) % 3 ? '0' : '1')).join('');

interface CodeRow {
  y: number;
  speed: number;
  alpha: number;
  size: number;
  text: string;
  shift: number;
}

function codeRow(y: number, speed: number, alpha: number, size: number): CodeRow {
  const k = Math.floor(Math.random() * SNIPPETS.length);
  const lines = [...SNIPPETS.slice(k), ...SNIPPETS.slice(0, k)];
  return { y, speed, alpha, size, text: lines.join('     '), shift: Math.random() * 600 };
}

// far rows drift slowly, near rows faster: a cheap parallax
const CODE_ROWS: CodeRow[] = [
  codeRow(22, 0.12, 0.11, 5),
  codeRow(34, 0.12, 0.11, 5),
  codeRow(46, 0.12, 0.11, 5),
  codeRow(58, 0.12, 0.11, 5),
  codeRow(28, 0.32, 0.19, 6),
  codeRow(52, 0.32, 0.19, 6),
  codeRow(74, 0.32, 0.16, 6),
];

export function drawRunner(ctx: Ctx, w: RunnerWorld, pal: Palette, now: number) {
  ctx.fillStyle = pal.bg1;
  ctx.fillRect(0, 0, VW, VH);
  drawCode(ctx, w, pal);
  drawBestMarker(ctx, w, pal);
  drawGround(ctx, w, pal);
  for (const p of w.pickups) drawPickup(ctx, p, pal, now);
  for (const o of w.obstacles) drawObstacle(ctx, o, pal, now);
  drawHero(ctx, w, pal, now);
  drawEffects(ctx, w, pal);
  drawHud(ctx, w, pal);
}

function tile(ctx: Ctx, text: string, offset: number, y: number) {
  const width = ctx.measureText(text).width + 24;
  const x = -(offset % width);
  ctx.fillText(text, x, y);
  if (x + width < VW) ctx.fillText(text, x + width, y);
}

function drawCode(ctx: Ctx, w: RunnerWorld, pal: Palette) {
  ctx.fillStyle = pal.t1;
  for (const row of CODE_ROWS) {
    ctx.font = `${row.size}px ${FONT}`;
    ctx.globalAlpha = row.alpha;
    tile(ctx, row.text, w.dist * row.speed + row.shift, row.y);
  }
  ctx.globalAlpha = 1;
}

function drawBestMarker(ctx: Ctx, w: RunnerWorld, pal: Palette) {
  const x = Math.round(HERO_X + w.best * PX_PER_M - w.dist);
  if (w.best <= 0 || x < -2 || x > VW + 2) return;
  ctx.fillStyle = pal.hl1;
  ctx.globalAlpha = 0.6;
  for (let y = 16; y < GROUND_Y; y += 4) ctx.fillRect(x, y, 1, 2);
  ctx.globalAlpha = 1;
  ctx.font = `5px ${FONT}`;
  ctx.fillText('best', x + 2, 20);
}

function drawGround(ctx: Ctx, w: RunnerWorld, pal: Palette) {
  // the ground is made of bits, scrolling with the world
  ctx.fillStyle = pal.t1;
  ctx.font = `5px ${FONT}`;
  ctx.globalAlpha = 0.32;
  tile(ctx, BITS, w.dist, GROUND_Y + 8);
  ctx.globalAlpha = 0.16;
  tile(ctx, BITS, w.dist + 37, GROUND_Y + 15);
  ctx.globalAlpha = 1;

  const gaps = [...w.gaps].sort((a, b) => a.x - b.x);
  ctx.fillStyle = pal.bg1;
  for (const g of gaps) ctx.fillRect(Math.round(g.x), GROUND_Y, Math.round(g.w), VH - GROUND_Y);

  ctx.fillStyle = pal.t1;
  let x = 0;
  for (const g of gaps) {
    const gx = Math.round(g.x);
    if (gx > x) ctx.fillRect(x, GROUND_Y, gx - x, 1);
    ctx.globalAlpha = 0.5;
    ctx.fillRect(gx - 1, GROUND_Y + 1, 1, 4);
    ctx.fillRect(gx + Math.round(g.w), GROUND_Y + 1, 1, 4);
    ctx.globalAlpha = 1;
    x = gx + Math.round(g.w);
  }
  if (x < VW) ctx.fillRect(x, GROUND_Y, VW - x, 1);

  // ticks just under the line make the speed readable
  ctx.globalAlpha = 0.45;
  for (let tx = -(w.dist % 12); tx < VW; tx += 12) {
    const px = Math.round(tx);
    if (!gaps.some((g) => px + 2 > g.x && px < g.x + g.w)) ctx.fillRect(px, GROUND_Y + 2, 2, 1);
  }
  ctx.globalAlpha = 1;
}

function drawHero(ctx: Ctx, w: RunnerWorld, pal: Palette, now: number) {
  if (w.death && w.death !== 'gap') return; // it burst into pixels
  const h = w.hero;
  const y = Math.round(h.y);
  const frame = Math.floor(h.step) % 2;
  const solid = Math.floor(now / 530) % 2 === 0 || !!w.death;
  if (h.ducking) {
    drawBody(ctx, HERO_X, y - 5, 9, 4, solid, pal);
    drawSprite(ctx, LEGS_DUCK[frame], HERO_X, y - 1, pal.t2);
  } else {
    drawBody(ctx, HERO_X, y - 10, 7, 8, solid, pal);
    drawSprite(ctx, h.grounded ? LEGS_RUN[frame] : LEGS_AIR, HERO_X, y - 2, pal.t2);
  }
}

/** The cursor blinks between a solid block and a hollow one, so it never vanishes. */
function drawBody(ctx: Ctx, x: number, y: number, bw: number, bh: number, solid: boolean, pal: Palette) {
  ctx.fillStyle = pal.hl1;
  if (solid) {
    ctx.fillRect(x, y, bw, bh);
    return;
  }
  ctx.globalAlpha = 0.3;
  ctx.fillRect(x + 1, y + 1, bw - 2, bh - 2);
  ctx.globalAlpha = 1;
  ctx.fillRect(x, y, bw, 1);
  ctx.fillRect(x, y + bh - 1, bw, 1);
  ctx.fillRect(x, y, 1, bh);
  ctx.fillRect(x + bw - 1, y, 1, bh);
}

function drawObstacle(ctx: Ctx, o: Obstacle, pal: Palette, now: number) {
  const x = Math.round(o.x);
  if (o.kind === 'bug') {
    drawSprite(ctx, BUG_BODY, x, o.y, pal.hl1);
    drawSprite(ctx, BUG_LEGS[Math.floor(now / 110) % 2], x, o.y + 5, pal.t1);
  } else if (o.kind === 'stack') {
    for (let by = o.y; by < o.y + o.h; by += BLOCK_H)
      for (let bx = x; bx < x + o.w; bx += BLOCK) {
        ctx.fillStyle = pal.bg2;
        ctx.fillRect(bx, by, BLOCK - 1, BLOCK_H - 1);
        drawSprite(ctx, BRACE_L, bx + 1, by + 1, pal.t2);
        drawSprite(ctx, BRACE_R, bx + 5, by + 1, pal.t2);
      }
  } else {
    ctx.fillStyle = pal.t2;
    ctx.fillRect(x + 1, o.y, o.w - 2, 1);
    ctx.fillRect(x + 1, o.y + o.h - 1, o.w - 2, 1);
    ctx.fillRect(x, o.y + 1, 1, o.h - 2);
    ctx.fillRect(x + o.w - 1, o.y + 1, 1, o.h - 2);
    ctx.fillStyle = pal.hl1;
    const shift = Math.floor(now / 90);
    for (let i = 0; i < 27; i++)
      if (o.bits[(i + shift) % 27]) ctx.fillRect(x + 1 + (i % 9), o.y + 1 + Math.floor(i / 9), 1, 1);
    ctx.fillStyle = pal.t1;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(x + o.w + 1, o.y + 1, 4, 1);
    ctx.fillRect(x + o.w + 2, o.y + 3, 3, 1);
    ctx.globalAlpha = 1;
  }
}

function drawPickup(ctx: Ctx, p: Pickup, pal: Palette, now: number) {
  const x = Math.round(p.x);
  const y = Math.round(p.y + Math.sin(now / 180 + p.x * 0.15));
  if (p.kind === 'coin') {
    drawSprite(ctx, COIN, x - 2, y - 3, pal.hl1);
    return;
  }
  ctx.fillStyle = pal.t1;
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(x - 6 + i * 3, y - 5, 1, 1);
    ctx.fillRect(x - 6 + i * 3, y + 3, 1, 1);
  }
  ctx.fillStyle = pal.hl1;
  ctx.fillRect(x - 8, y - 4, 16, 7);
  ctx.fillStyle = pal.bg1;
  ctx.font = `bold 5px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('.exe', x, y + 1.5);
  ctx.textAlign = 'left';
}

function drawEffects(ctx: Ctx, w: RunnerWorld, pal: Palette) {
  for (const p of w.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = pal[p.color];
    ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
  }
  ctx.font = `5px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = pal.hl1;
  for (const f of w.floaters) {
    ctx.globalAlpha = Math.min(1, f.life * 2.5);
    ctx.fillText(f.text, Math.round(f.x), Math.round(f.y));
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

function drawHud(ctx: Ctx, w: RunnerWorld, pal: Palette) {
  ctx.font = `6px ${FONT}`;
  ctx.fillStyle = pal.hl1;
  ctx.fillText(`$ ${w.coins}${w.exes ? `  .exe ${w.exes}` : ''}`, 4, 9);
  ctx.fillStyle = pal.t2;
  ctx.textAlign = 'right';
  ctx.fillText(`${w.metres} m`, VW - 4, 9);
  ctx.textAlign = 'center';
  if (w.death) {
    ctx.fillStyle = pal.hl1;
    ctx.font = `bold 8px ${FONT}`;
    ctx.fillText(w.deathMessage, VW / 2, 42);
  } else if (w.time < 4) {
    ctx.fillStyle = pal.t1;
    ctx.globalAlpha = Math.min(1, 4 - w.time);
    ctx.font = `5px ${FONT}`;
    ctx.fillText('w / tap: jump (hold = higher)   s / swipe down: duck', VW / 2, 40);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = 'left';
}
