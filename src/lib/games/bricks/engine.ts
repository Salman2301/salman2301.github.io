import type { GameApi } from '../../core/types';
import { clamp, rand, type Palette } from '../kit';
import { COLS, levelAt, parse, type Cell, type Grid } from './levels';

/**
 * Brick breaker rules and physics, independent of the DOM. Bricks.svelte
 * feeds input in and draw.ts renders the public fields.
 */

export const VW = 192;
export const VH = 144;
/** Ceiling of the playfield; the HUD lives above it. */
export const TOP = 11;
export const BW = 12;
export const BH = 6;
export const GRID_X = (VW - COLS * BW) / 2;
export const GRID_Y = TOP + 9;
export const PADDLE_Y = VH - 10;
export const PADDLE_H = 3;
export const BALL_R = 2;

const PADDLE_W = 28;
const WIDE_W = 42;
const PADDLE_ACCEL = 900;
const PADDLE_MAX = 200;
const PADDLE_MIN = 60;
const PADDLE_BRAKE = 1400;
const DRAG_MAX = 900;
const MAX_ANGLE = 1.08; // ~62 degrees from vertical at the paddle edge
const MIN_DY = 0.26; // keeps the ball from crawling sideways forever
const SUBSTEP = 1; // max px per collision step, far below the 6 px brick height
const MAX_BALLS = 8;
const CAPSULE_SPEED = 36;
const BOLT_SPEED = 240;
const LASER_COOLDOWN = 0.28;
const CATCH_HOLD = 2.5;
const MAX_LIVES = 5;

export type PowerKind = 'wide' | 'multi' | 'slow' | 'sticky' | 'life' | 'laser';

export const POWERS: Record<PowerKind, { label: string; name: string; duration: number; weight: number }> = {
  wide: { label: 'W', name: 'wide paddle', duration: 15, weight: 3 },
  multi: { label: 'M', name: 'multi-ball', duration: 0, weight: 3 },
  slow: { label: 'S', name: 'slow ball', duration: 10, weight: 2 },
  sticky: { label: 'G', name: 'sticky paddle', duration: 15, weight: 2 },
  life: { label: '+', name: 'extra life', duration: 0, weight: 1 },
  laser: { label: 'L', name: 'laser: hold j', duration: 12, weight: 2 },
};
export const TIMED: PowerKind[] = ['wide', 'slow', 'sticky', 'laser'];

export interface Ball {
  x: number;
  y: number;
  dx: number;
  dy: number;
  stuck: boolean;
  /** Offset from the paddle centre while stuck. */
  offset: number;
  /** Seconds until a caught ball releases itself; 0 waits for the player. */
  release: number;
  lost: boolean;
  trail: { x: number; y: number }[];
}
export interface Capsule {
  kind: PowerKind;
  x: number;
  y: number;
}
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: keyof Palette;
}
export interface Floater {
  x: number;
  y: number;
  text: string;
  life: number;
}
export interface BricksInput {
  /** -1 left, 1 right, 0 none (held keys). */
  dir: number;
  /** Pointer target in virtual px, or null when not dragging. */
  targetX: number | null;
  fire: boolean;
}
export interface Hooks {
  sfx: GameApi['sfx'];
  score(n: number): void;
  over(score: number, message: string): void;
}

export function brickColor(cell: Cell): keyof Palette {
  if (cell.steel) return 'bg2';
  return cell.hp >= 3 ? 'hl1' : cell.hp === 2 ? 't2' : 't1';
}

export class BricksGame {
  level = 0;
  levelName = '';
  lives = 3;
  score = 0;
  combo = 0;
  cells: Grid = [];
  remaining = 0;
  paddle = { x: VW / 2, w: PADDLE_W, vx: 0 };
  balls: Ball[] = [];
  capsules: Capsule[] = [];
  bolts: { x: number; y: number }[] = [];
  particles: Particle[] = [];
  floaters: Floater[] = [];
  /** Seconds left on each active timed power-up. */
  effects: Partial<Record<PowerKind, number>> = {};
  banner: { title: string; sub: string; t: number } | null = null;
  shake = 0;
  clearT = 0;
  over = false;
  /** Seconds of play in this life; the ball speeds up with it. */
  private playTime = 0;
  private laserCooldown = 0;

  constructor(private hooks: Hooks) {
    this.load(0);
  }

  get speed(): number {
    const base = 92 + Math.min(this.level, 10) * 5;
    return (base + Math.min(70, this.playTime * 1.2)) * (this.effects.slow ? 0.65 : 1);
  }

  get serving(): boolean {
    return this.balls.some((b) => b.stuck && b.release === 0);
  }

  load(index: number) {
    const def = levelAt(index);
    this.level = index;
    this.levelName = def.name;
    this.cells = parse(def);
    this.remaining = this.cells.flat().filter((c) => c && !c.steel).length;
    this.capsules = [];
    this.bolts = [];
    this.effects = {};
    this.playTime = 0;
    this.combo = 0;
    this.banner = { title: `LEVEL ${index + 1}`, sub: def.name, t: 2.4 };
    this.serve();
  }

  private serve() {
    this.balls = [this.newBall(this.paddle.x, PADDLE_Y - BALL_R, 0, -1, true)];
  }

  private newBall(x: number, y: number, dx: number, dy: number, stuck = false): Ball {
    return { x, y, dx, dy, stuck, offset: 0, release: 0, lost: false, trail: [] };
  }

  /** w, up, enter or a tap: launch any ball resting on the paddle. */
  launch(): boolean {
    let launched = false;
    for (const b of this.balls) {
      if (!b.stuck) continue;
      this.releaseBall(b);
      launched = true;
    }
    if (launched) this.hooks.sfx('blip');
    return launched;
  }

  private releaseBall(b: Ball) {
    let rel = b.offset / (this.paddle.w / 2);
    // never serve straight up: a vertical ball can loop in an empty column
    if (Math.abs(rel) < 0.15) rel = (Math.random() < 0.5 ? -1 : 1) * rand(0.18, 0.32);
    this.aim(b, rel);
    b.stuck = false;
    b.release = 0;
  }

  private aim(b: Ball, rel: number) {
    const a = clamp(rel, -1, 1) * MAX_ANGLE;
    b.dx = Math.sin(a);
    b.dy = -Math.cos(a);
  }

  update(dt: number, input: BricksInput) {
    if (this.over) return;
    this.tickEffects(dt);
    if (this.clearT > 0) {
      this.clearT -= dt;
      if (this.clearT <= 0) this.load(this.level + 1);
      return;
    }
    this.movePaddle(dt, input);
    if (!this.serving) this.playTime += dt;
    for (const b of this.balls) this.updateBall(b, dt);
    this.balls = this.balls.filter((b) => !b.lost);
    this.updateLaser(dt, input.fire);
    this.updateCapsules(dt);
    if (this.remaining <= 0) this.clearLevel();
    else if (!this.balls.length) this.loseLife();
  }

  private tickEffects(dt: number) {
    this.shake = Math.max(0, this.shake - dt);
    if (this.banner && (this.banner.t -= dt) <= 0) this.banner = null;
    for (const k of TIMED) {
      const left = this.effects[k];
      if (left === undefined) continue;
      if (left - dt <= 0) delete this.effects[k];
      else this.effects[k] = left - dt;
    }
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 140 * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const f of this.floaters) {
      f.y -= 14 * dt;
      f.life -= dt;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
  }

  private movePaddle(dt: number, input: BricksInput) {
    const p = this.paddle;
    p.w += ((this.effects.wide ? WIDE_W : PADDLE_W) - p.w) * Math.min(1, dt * 10);
    const half = p.w / 2;
    if (input.targetX !== null) {
      const step = clamp(input.targetX - p.x, -DRAG_MAX * dt, DRAG_MAX * dt);
      p.x += step;
      p.vx = 0;
    } else if (input.dir) {
      if (p.vx * input.dir < 0) p.vx += input.dir * PADDLE_BRAKE * dt;
      else if (Math.abs(p.vx) < PADDLE_MIN) p.vx = input.dir * PADDLE_MIN;
      p.vx = clamp(p.vx + input.dir * PADDLE_ACCEL * dt, -PADDLE_MAX, PADDLE_MAX);
      p.x += p.vx * dt;
    } else {
      p.vx = Math.sign(p.vx) * Math.max(0, Math.abs(p.vx) - PADDLE_BRAKE * dt);
      p.x += p.vx * dt;
    }
    const x = clamp(p.x, half + 1, VW - half - 1);
    if (x !== p.x) p.vx = 0;
    p.x = x;
  }

  private updateBall(b: Ball, dt: number) {
    if (b.stuck) {
      b.offset = clamp(b.offset, -this.paddle.w / 2 + 2, this.paddle.w / 2 - 2);
      b.x = this.paddle.x + b.offset;
      b.y = PADDLE_Y - BALL_R;
      b.trail.length = 0;
      if (b.release > 0 && (b.release -= dt) <= 0) this.releaseBall(b);
      return;
    }
    b.trail.unshift({ x: b.x, y: b.y });
    if (b.trail.length > 4) b.trail.pop();
    const dist = this.speed * dt;
    const n = Math.max(1, Math.ceil(dist / SUBSTEP));
    for (let i = 0; i < n && !b.stuck && !b.lost; i++) this.substep(b, dist / n);
  }

  /** Move one small step, axis by axis, so the ball can never skip a brick. */
  private substep(b: Ball, s: number) {
    b.x += b.dx * s;
    if (b.x < BALL_R + 1) {
      b.x = BALL_R + 1;
      b.dx = Math.abs(b.dx);
    } else if (b.x > VW - BALL_R - 1) {
      b.x = VW - BALL_R - 1;
      b.dx = -Math.abs(b.dx);
    } else {
      const hit = this.brickAt(b);
      if (hit) {
        b.x -= b.dx * s;
        b.dx = -b.dx;
        this.hitBrick(hit.r, hit.c, true);
      }
    }
    b.y += b.dy * s;
    if (b.y < TOP + BALL_R + 1) {
      b.y = TOP + BALL_R + 1;
      b.dy = Math.abs(b.dy);
    } else {
      const hit = this.brickAt(b);
      if (hit) {
        b.y -= b.dy * s;
        b.dy = -b.dy;
        this.hitBrick(hit.r, hit.c, true);
      } else if (b.dy > 0 && this.onPaddle(b)) this.paddleBounce(b);
      else if (b.y - BALL_R > VH) b.lost = true;
    }
    this.keepAngle(b);
  }

  /** The brick overlapping the ball's box that is closest to its centre. */
  private brickAt(b: Ball): { r: number; c: number } | null {
    const c0 = Math.floor((b.x - BALL_R - GRID_X) / BW);
    const c1 = Math.floor((b.x + BALL_R - 0.001 - GRID_X) / BW);
    const r0 = Math.floor((b.y - BALL_R - GRID_Y) / BH);
    const r1 = Math.floor((b.y + BALL_R - 0.001 - GRID_Y) / BH);
    let best: { r: number; c: number } | null = null;
    let bestD = Infinity;
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        if (!this.cells[r]?.[c]) continue;
        const d = (GRID_X + (c + 0.5) * BW - b.x) ** 2 + (GRID_Y + (r + 0.5) * BH - b.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { r, c };
        }
      }
    return best;
  }

  private onPaddle(b: Ball): boolean {
    const p = this.paddle;
    return b.y + BALL_R >= PADDLE_Y && b.y - BALL_R <= PADDLE_Y + PADDLE_H && Math.abs(b.x - p.x) <= p.w / 2 + BALL_R;
  }

  private paddleBounce(b: Ball) {
    const p = this.paddle;
    b.y = PADDLE_Y - BALL_R;
    this.combo = 0;
    this.hooks.sfx('blip');
    if (this.effects.sticky) {
      b.stuck = true;
      b.offset = b.x - p.x;
      b.release = CATCH_HOLD;
      return;
    }
    this.aim(b, (b.x - p.x) / (p.w / 2) + rand(-0.04, 0.04));
  }

  private keepAngle(b: Ball) {
    if (Math.abs(b.dy) >= MIN_DY) return;
    b.dy = (b.dy < 0 ? -1 : 1) * MIN_DY;
    b.dx = (b.dx < 0 ? -1 : 1) * Math.sqrt(1 - MIN_DY * MIN_DY);
  }

  private hitBrick(r: number, c: number, byBall: boolean) {
    const cell = this.cells[r][c];
    if (!cell) return;
    const x = GRID_X + (c + 0.5) * BW;
    const y = GRID_Y + (r + 0.5) * BH;
    if (cell.steel) {
      this.burst(x, y, 3, 't1');
      return;
    }
    const color = brickColor(cell);
    cell.hp--;
    if (byBall) this.combo++;
    const multiplier = byBall ? clamp(this.combo, 1, 12) : 1;
    const points = 10 * multiplier;
    this.addScore(points);
    this.floaters.push({ x, y, text: multiplier > 1 ? `+${points} x${multiplier}` : `+${points}`, life: 0.7 });
    this.hooks.sfx('blip');
    if (cell.hp > 0) return;
    this.cells[r][c] = null;
    this.remaining--;
    this.burst(x, y, 10, color);
    if (cell.drop || (Math.random() < 0.11 && this.capsules.length < 3)) this.drop(x, y);
  }

  private drop(x: number, y: number) {
    const kinds = Object.keys(POWERS) as PowerKind[];
    let roll = Math.random() * kinds.reduce((s, k) => s + POWERS[k].weight, 0);
    const kind = kinds.find((k) => (roll -= POWERS[k].weight) < 0) ?? 'wide';
    this.capsules.push({ kind, x, y });
  }

  private updateCapsules(dt: number) {
    const p = this.paddle;
    for (const cap of this.capsules) {
      cap.y += CAPSULE_SPEED * dt;
      const caught = cap.y + 3 >= PADDLE_Y && cap.y - 3 <= PADDLE_Y + PADDLE_H && Math.abs(cap.x - p.x) <= p.w / 2 + 5;
      if (caught) {
        this.apply(cap.kind);
        cap.y = VH + 99;
      }
    }
    this.capsules = this.capsules.filter((c) => c.y < VH + 6);
  }

  private apply(kind: PowerKind) {
    const def = POWERS[kind];
    this.hooks.sfx('score');
    this.floaters.push({ x: this.paddle.x, y: PADDLE_Y - 6, text: def.name, life: 1.2 });
    if (kind === 'life') this.lives = Math.min(MAX_LIVES, this.lives + 1);
    else if (kind === 'multi') this.split();
    else this.effects[kind] = def.duration;
  }

  /** Every free ball becomes three, fanned out a little. */
  private split() {
    if (this.balls.every((b) => b.stuck)) this.launch();
    const extra: Ball[] = [];
    for (const b of this.balls) {
      if (b.stuck) continue;
      for (const turn of [-0.35, 0.35]) {
        if (this.balls.length + extra.length >= MAX_BALLS) break;
        const cos = Math.cos(turn);
        const sin = Math.sin(turn);
        const nb = this.newBall(b.x, b.y, b.dx * cos - b.dy * sin, b.dx * sin + b.dy * cos);
        this.keepAngle(nb);
        extra.push(nb);
      }
    }
    this.balls.push(...extra);
  }

  private updateLaser(dt: number, fire: boolean) {
    this.laserCooldown = Math.max(0, this.laserCooldown - dt);
    if (fire && this.effects.laser && this.laserCooldown <= 0) this.fireLaser();
    for (const bolt of this.bolts) {
      const dist = BOLT_SPEED * dt;
      const n = Math.ceil(dist / 2);
      for (let i = 0; i < n && bolt.y > TOP; i++) {
        bolt.y -= dist / n;
        const r = Math.floor((bolt.y - GRID_Y) / BH);
        const c = Math.floor((bolt.x - GRID_X) / BW);
        if (this.cells[r]?.[c]) {
          this.hitBrick(r, c, false);
          bolt.y = -99;
        }
      }
    }
    this.bolts = this.bolts.filter((b) => b.y > TOP);
  }

  /** Tap on the canvas: launch a resting ball, otherwise fire once. */
  tap() {
    if (!this.launch() && this.effects.laser) this.fireLaser();
  }

  private fireLaser() {
    if (!this.effects.laser || this.laserCooldown > 0 || this.clearT > 0) return;
    const p = this.paddle;
    this.bolts.push({ x: p.x - p.w / 2 + 2, y: PADDLE_Y - 1 }, { x: p.x + p.w / 2 - 2, y: PADDLE_Y - 1 });
    this.laserCooldown = LASER_COOLDOWN;
    this.hooks.sfx('blip');
  }

  private clearLevel() {
    const bonus = 100 * (this.level + 1);
    this.addScore(bonus);
    this.balls = [];
    this.capsules = [];
    this.bolts = [];
    this.clearT = 1.8;
    this.banner = { title: 'LEVEL CLEAR', sub: `bonus +${bonus}`, t: 1.8 };
    this.hooks.sfx('win');
  }

  private loseLife() {
    this.lives--;
    this.shake = 0.35;
    this.combo = 0;
    this.effects = {};
    this.capsules = [];
    this.bolts = [];
    this.playTime = 0;
    this.hooks.sfx('hit');
    if (this.lives <= 0) {
      this.over = true;
      this.hooks.over(this.score, `reached level ${this.level + 1} · ${this.levelName}`);
      return;
    }
    this.serve();
    this.banner = { title: `${this.lives} ${this.lives === 1 ? 'LIFE' : 'LIVES'} LEFT`, sub: '', t: 1.4 };
  }

  private addScore(n: number) {
    this.score += n;
    this.hooks.score(this.score);
  }

  private burst(x: number, y: number, n: number, color: keyof Palette) {
    for (let i = 0; i < n; i++) {
      const life = rand(0.3, 0.7);
      this.particles.push({ x, y, vx: rand(-55, 55), vy: rand(-60, 15), life, max: life, color });
    }
  }
}
