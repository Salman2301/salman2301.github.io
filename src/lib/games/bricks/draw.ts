import type { Palette } from '../kit';
import {
  BALL_R,
  BH,
  BW,
  GRID_BOTTOM,
  GRID_X,
  GRID_Y,
  PADDLE_H,
  POWERS,
  TIMED,
  TOP,
  VW,
  brickColor,
  type BricksGame,
} from './engine';
import type { Cell } from './levels';

/** Renders a BricksGame in virtual pixels. Every colour comes from the theme palette. */

type Ctx = CanvasRenderingContext2D;

const FONT = '"JetBrains Mono", ui-monospace, monospace';
/** HUD text never renders smaller than this many CSS px, however small the pane. */
const MIN_TEXT_PX = 8;

/** A font of `size` virtual px, enlarged when the canvas is scaled down too far to read it. */
function font(size: number, scale: number, bold = false) {
  return `${bold ? 'bold ' : ''}${Math.max(size, MIN_TEXT_PX / scale).toFixed(2)}px ${FONT}`;
}

/** Draw one frame. `scale` is CSS px per virtual px, used to keep text legible. */
export function drawBricks(ctx: Ctx, g: BricksGame, pal: Palette, now: number, scale: number) {
  ctx.save();
  ctx.fillStyle = pal.bg1;
  ctx.fillRect(0, 0, VW, g.vh);
  if (g.shake > 0) {
    // a short, subtle wobble driven by the game clock, so it freezes with the game
    const a = (g.shake / 0.35) * 1.5;
    ctx.translate(Math.round(Math.sin(now * 0.11) * a), Math.round(Math.cos(now * 0.07) * a));
  }
  drawFrame(ctx, g.vh, pal);
  drawGrid(ctx, g, pal);
  drawCapsules(ctx, g, pal, now);
  ctx.fillStyle = pal.hl1;
  for (const bolt of g.bolts) ctx.fillRect(Math.round(bolt.x), Math.round(bolt.y) - 4, 1, 4);
  drawPaddle(ctx, g, pal);
  drawBalls(ctx, g, pal);
  drawEffects(ctx, g, pal, scale);
  ctx.restore();
  drawHud(ctx, g, pal, scale);
  drawBanner(ctx, g, pal, now, scale);
}

function drawFrame(ctx: Ctx, vh: number, pal: Palette) {
  ctx.fillStyle = pal.bg2;
  ctx.fillRect(0, TOP, VW, 1);
  ctx.fillRect(0, TOP, 1, vh - TOP);
  ctx.fillRect(VW - 1, TOP, 1, vh - TOP);
}

function drawGrid(ctx: Ctx, g: BricksGame, pal: Palette) {
  g.cells.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (cell) drawBrick(ctx, cell, GRID_X + c * BW, GRID_Y + r * BH, pal);
    }),
  );
}

function drawBrick(ctx: Ctx, cell: Cell, x: number, y: number, pal: Palette) {
  const w = BW - 1;
  const h = BH - 1;
  ctx.fillStyle = pal[brickColor(cell)];
  ctx.fillRect(x, y, w, h);
  if (cell.steel) {
    ctx.strokeStyle = pal.t1;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = pal.t1;
    ctx.fillRect(x + 2, y + 2, 1, 1);
    ctx.fillRect(x + w - 3, y + 2, 1, 1);
    ctx.globalAlpha = 1;
    return;
  }
  ctx.fillStyle = pal.bg1;
  ctx.globalAlpha = 0.3;
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.globalAlpha = 0.8;
  const damage = cell.max - cell.hp;
  if (damage >= 1) {
    ctx.fillRect(x + 3, y + 1, 1, 2);
    ctx.fillRect(x + 4, y + 2, 2, 1);
    ctx.fillRect(x + 6, y + 3, 1, 1);
  }
  if (damage >= 2) {
    ctx.fillRect(x + 8, y, 1, 2);
    ctx.fillRect(x + 9, y + 2, 1, 2);
  }
  ctx.globalAlpha = 1;
  if (cell.drop) {
    ctx.fillRect(x + 4, y + 2, 3, 1);
    ctx.fillRect(x + 5, y + 1, 1, 3);
  }
}

function drawCapsules(ctx: Ctx, g: BricksGame, pal: Palette, now: number) {
  ctx.font = `bold 5px ${FONT}`;
  ctx.textAlign = 'center';
  for (const cap of g.capsules) {
    const x = Math.round(cap.x - 6);
    const y = Math.round(cap.y - 3);
    ctx.fillStyle = pal.hl1;
    ctx.fillRect(x + 1, y, 10, 1);
    ctx.fillRect(x + 1, y + 6, 10, 1);
    ctx.fillRect(x, y + 1, 1, 5);
    ctx.fillRect(x + 11, y + 1, 1, 5);
    ctx.fillStyle = pal.bg1;
    ctx.fillRect(x + 1, y + 1, 10, 5);
    if (Math.floor(now / 220) % 2) {
      ctx.fillStyle = pal.hl1;
      ctx.globalAlpha = 0.25;
      ctx.fillRect(x + 1, y + 1, 10, 5);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = pal.t2;
    ctx.fillText(POWERS[cap.kind].label, x + 6, y + 5.4);
  }
  ctx.textAlign = 'left';
}

function drawPaddle(ctx: Ctx, g: BricksGame, pal: Palette) {
  const p = g.paddle;
  const x = Math.round(p.x - p.w / 2);
  const y = g.paddleY;
  const w = Math.round(p.w);
  ctx.fillStyle = pal.t2;
  ctx.fillRect(x, y, w, PADDLE_H);
  ctx.fillStyle = pal.hl1;
  ctx.fillRect(x, y, 3, PADDLE_H);
  ctx.fillRect(x + w - 3, y, 3, PADDLE_H);
  if (g.effects.sticky) for (let i = x + 4; i < x + w - 4; i += 2) ctx.fillRect(i, y - 1, 1, 1);
  if (g.effects.laser) {
    ctx.fillRect(x + 1, y - 2, 2, 2);
    ctx.fillRect(x + w - 3, y - 2, 2, 2);
  }
}

function drawBalls(ctx: Ctx, g: BricksGame, pal: Palette) {
  for (const b of g.balls) {
    ctx.fillStyle = pal.hl1;
    b.trail.forEach((t, i) => {
      ctx.globalAlpha = 0.32 - i * 0.08;
      ctx.fillRect(Math.round(t.x) - 1, Math.round(t.y) - 1, 2, 2);
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle = pal.t2;
    ctx.beginPath();
    ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawEffects(ctx: Ctx, g: BricksGame, pal: Palette, scale: number) {
  for (const p of g.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = pal[p.color];
    ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
  }
  ctx.font = font(5, scale);
  ctx.textAlign = 'center';
  ctx.fillStyle = pal.hl1;
  for (const f of g.floaters) {
    ctx.globalAlpha = Math.min(1, f.life * 2.5);
    ctx.fillText(f.text, Math.round(f.x), Math.round(f.y));
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

function drawHud(ctx: Ctx, g: BricksGame, pal: Palette, scale: number) {
  ctx.fillStyle = pal.bg1;
  ctx.fillRect(0, 0, VW, TOP);
  for (let i = 0; i < g.lives; i++) {
    const x = 3 + i * 7;
    ctx.fillStyle = pal.t2;
    ctx.fillRect(x, 4, 5, 2);
    ctx.fillStyle = pal.hl1;
    ctx.fillRect(x, 4, 1, 2);
    ctx.fillRect(x + 4, 4, 1, 2);
  }
  ctx.font = font(6, scale);
  ctx.fillStyle = pal.t1;
  ctx.fillText(`L${g.level + 1} ${g.levelName}`, 5 + Math.max(3, g.lives) * 7, 8);

  // timed power-ups, right aligned: letter + a bar that drains
  let x = VW - 3;
  ctx.font = font(6, scale, true);
  for (const k of TIMED) {
    const left = g.effects[k];
    if (left === undefined) continue;
    x -= 12;
    ctx.fillStyle = pal.bg2;
    ctx.fillRect(x, 5, 12, 2);
    ctx.fillStyle = pal.hl1;
    ctx.fillRect(x, 5, Math.ceil((12 * left) / POWERS[k].duration), 2);
    x -= 6;
    ctx.fillText(POWERS[k].label, x, 8);
    x -= 5;
  }
  if (g.combo >= 2) {
    ctx.fillStyle = pal.hl1;
    ctx.textAlign = 'right';
    ctx.fillText(`x${g.combo}`, x, 8);
    ctx.textAlign = 'left';
  }
}

function drawBanner(ctx: Ctx, g: BricksGame, pal: Palette, now: number, scale: number) {
  ctx.textAlign = 'center';
  if (g.banner) {
    // centred in the open space between the bricks and the paddle
    const h = g.banner.sub ? 24 : 16;
    const y = Math.round((GRID_BOTTOM + g.paddleY) / 2 - h / 2);
    ctx.fillStyle = pal.bg1;
    ctx.globalAlpha = 0.72;
    ctx.fillRect(0, y, VW, h);
    ctx.globalAlpha = 1;
    ctx.fillStyle = pal.hl1;
    ctx.font = font(10, scale, true);
    ctx.fillText(g.banner.title, VW / 2, y + 11);
    if (g.banner.sub) {
      ctx.fillStyle = pal.t1;
      ctx.font = font(6, scale);
      ctx.fillText(g.banner.sub, VW / 2, y + 20);
    }
  }
  if (g.serving && !g.over && Math.floor(now / 600) % 2 === 0) {
    ctx.fillStyle = pal.t1;
    ctx.font = font(5, scale);
    ctx.fillText('w / tap to launch', VW / 2, g.paddleY - 9);
  }
  ctx.textAlign = 'left';
}
