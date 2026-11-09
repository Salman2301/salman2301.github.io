import type { GameApi } from '../../core/types';
import { rand, type Palette } from '../kit';

/**
 * Byte Runner rules, physics and obstacle generation, independent of the
 * DOM. Everything lives in screen space (virtual px) and scrolls left.
 */

/** The world: VW wide and VH high, in virtual px. */
export const VW = 224;
export const VH = 108;
/**
 * The canvas adapts to the pane within these limits: wider panes see more
 * of the road ahead, taller ones more sky. Hazards spawn beyond the widest
 * view so nothing pops in.
 */
export const VIEW = { maxW: 296, maxH: 224 };
const SPAWN_X = VIEW.maxW + 8;
export const GROUND_Y = 88;
export const HERO_X = 30;
export const HERO = { w: 7, h: 10, duckW: 9, duckH: 5 };
export const PX_PER_M = 8;
export const BLOCK = 10;
export const BLOCK_H = 8;

const STEP = 1 / 60; // the kit loop's fixed step, also used to pre-simulate jumps
const GRAVITY = 560;
const HOLD_GRAVITY = 300;
const HOLD_MAX = 0.2;
const JUMP_V = 158;
const FAST_FALL = 1400;
const COYOTE = 0.09;
const BUFFER = 0.13;
/** Seconds the player gets after landing before the next hazard arrives. */
const REACT = 0.42;
const START_SPEED = 72;
const MAX_SPEED = 172;
const RAMP = 1.25;
const COIN_POINTS = 10;
const EXE_POINTS = 50;
const DEATH_T = 0.8;

/** Extra speed towards the hero on top of the scrolling. */
const OWN_SPEED: Record<HazardKind, number> = { bug: 14, stack: 0, packet: 26, gap: 0 };

export type HazardKind = 'bug' | 'stack' | 'packet' | 'gap';
export type ObstacleKind = Exclude<HazardKind, 'gap'>;

export interface Obstacle {
  kind: ObstacleKind;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  /** Packet payload, drawn as pixels. */
  bits: boolean[];
}
export interface Gap {
  kind: 'gap';
  x: number;
  w: number;
}
export interface Pickup {
  kind: 'coin' | 'exe';
  x: number;
  y: number;
  taken: boolean;
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
export interface RunnerInput {
  jumpHeld: boolean;
  duck: boolean;
}
export interface Hooks {
  sfx: GameApi['sfx'];
  score(n: number): void;
  over(score: number, message: string, metres: number): void;
}

const DEATH_MESSAGE: Record<HazardKind, string> = {
  bug: 'caught a bug',
  stack: 'stack overflow',
  packet: 'packet collision',
  gap: 'segfault: fell into a gap',
};

/* ------------------------------------------------- jump pre-simulation */

/** Height above the ground at every step of a jump, with the key held or tapped. */
function simulateJump(hold: boolean): number[] {
  const heights: number[] = [];
  let y = 0;
  let vy = -JUMP_V;
  let holdT = 0;
  while (heights.length < 600) {
    let g = GRAVITY;
    if (hold && vy < 0 && holdT < HOLD_MAX) {
      g = HOLD_GRAVITY;
      holdT += STEP;
    }
    vy += g * STEP;
    y += vy * STEP;
    if (y >= 0) break;
    heights.push(-y);
  }
  return heights;
}

const HELD_ARC = simulateJump(true);
const TAP_ARC = simulateJump(false);
export const JUMP_PEAK = Math.max(...HELD_ARC);
const airtime = (arc: number[]) => arc.length * STEP;
const timeAbove = (arc: number[], h: number) => arc.filter((y) => y > h).length * STEP;

/** A held jump keeps the hero above `height` long enough to pass `width` px at this speed. */
export function clearable(height: number, width: number, speed: number): boolean {
  return timeAbove(HELD_ARC, height + 1) * speed >= width + HERO.w + 6;
}
/** Widest gap that even a tapped jump crosses with room to spare. */
export const maxGap = (speed: number) => Math.min(64, airtime(TAP_ARC) * speed * 0.7);
/**
 * Free running time between one hazard passing the hero and the next one
 * reaching it: room for a full held jump, the landing and a reaction.
 */
export const MIN_GAP_TIME = airtime(HELD_ARC) + REACT;

/* --------------------------------------------------------------- world */

export class RunnerWorld {
  speed = START_SPEED;
  dist = 0;
  time = 0;
  coins = 0;
  exes = 0;
  score = 0;
  hero = { y: GROUND_Y, vy: 0, grounded: true, ducking: false, jumping: false, coyote: 0, buffer: 0, holdT: 0, step: 0 };
  obstacles: Obstacle[] = [];
  gaps: Gap[] = [];
  pickups: Pickup[] = [];
  particles: Particle[] = [];
  floaters: Floater[] = [];
  death: HazardKind | null = null;
  over = false;
  private dying = 0;
  /**
   * Screen x of the far edge of the most recent hazard and that hazard's own
   * speed. It keeps scrolling after the hazard leaves the screen, so spacing
   * stays right however long the next gap is. Starts one screen ahead: a
   * free run-up.
   */
  private lastEnd = VW;
  private lastSpeed = 0;
  private next: HazardKind = 'bug';
  /** Extra free seconds before the next hazard, for rhythm. */
  private nextExtra = 0;

  /** `best` is the best distance so far in metres, drawn as a marker. */
  constructor(private hooks: Hooks, public best = 0) {}

  get metres(): number {
    return Math.floor(this.dist / PX_PER_M);
  }

  pressJump() {
    this.hero.buffer = BUFFER;
  }

  update(dt: number, input: RunnerInput) {
    if (this.over) return;
    this.tickEffects(dt);
    if (this.death) return this.updateDeath(dt, this.death);
    this.time += dt;
    this.speed = Math.min(MAX_SPEED, START_SPEED + RAMP * this.time);
    const dx = this.speed * dt;
    this.dist += dx;
    this.scroll(dx, dt);
    this.spawn();
    this.updateHero(dt, input);
    this.collide();
    this.updateScore();
  }

  private tickEffects(dt: number) {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 160 * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const f of this.floaters) {
      f.y -= 12 * dt;
      f.life -= dt;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
  }

  private scroll(dx: number, dt: number) {
    for (const o of this.obstacles) o.x -= dx + o.vx * dt;
    for (const g of this.gaps) g.x -= dx;
    for (const p of this.pickups) p.x -= dx;
    this.lastEnd -= dx + this.lastSpeed * dt;
    this.obstacles = this.obstacles.filter((o) => o.x + o.w > -20);
    this.gaps = this.gaps.filter((g) => g.x + g.w > -20);
    this.pickups = this.pickups.filter((p) => p.x > -20 && !p.taken);
  }

  /* --------------------------------------------------------- generation */

  /**
   * Place the next hazard once it would enter the screen. Spacing is in
   * time, not pixels: it must reach the hero at least MIN_GAP_TIME after the
   * previous one has passed, counting both hazards' own speeds.
   */
  private spawn() {
    const v = this.speed;
    const passed = (this.lastEnd - HERO_X) / (v + this.lastSpeed); // negative once it is behind the hero
    const x = HERO_X + (v + OWN_SPEED[this.next]) * (passed + MIN_GAP_TIME + this.nextExtra);
    if (x > SPAWN_X + 8) return;
    this.build(this.next, Math.max(x, SPAWN_X));
    this.plan();
  }

  private plan() {
    const m = this.metres;
    const weights: [HazardKind, number][] = [
      ['bug', 3],
      ['stack', m > 12 ? 3 : 1],
      ['gap', m > 45 ? 2.5 : 0],
      ['packet', m > 90 ? 2.5 : 0],
    ];
    let roll = Math.random() * weights.reduce((s, [, w]) => s + w, 0);
    this.next = (weights.find(([, w]) => (roll -= w) < 0) ?? weights[0])[0];
    this.nextExtra = rand(0, 0.9);
  }

  private build(kind: HazardKind, x: number) {
    let end: number;
    if (kind === 'gap') {
      const w = Math.round(rand(16, Math.max(17, maxGap(this.speed))));
      this.gaps.push({ kind, x, w });
      end = x + w;
      if (Math.random() < 0.6) this.coinArc(x + w / 2, 18, 4);
    } else {
      const o = kind === 'bug' ? this.bug(x) : kind === 'packet' ? this.packets(x) : this.stack(x);
      end = o.x + o.w;
    }
    this.lastEnd = end;
    this.lastSpeed = OWN_SPEED[kind];
    // the stretch after a hazard is always free for at least MIN_GAP_TIME: room for a coin row
    const free = this.speed * MIN_GAP_TIME;
    if (Math.random() < 0.45) this.coinRow(end + free * 0.3, end + free * 0.75);
  }

  private bug(x: number): Obstacle {
    const o: Obstacle = { kind: 'bug', x, y: GROUND_Y - 6, w: 10, h: 6, vx: OWN_SPEED.bug, bits: [] };
    this.obstacles.push(o);
    return o;
  }

  /** Returns the last packet when they come in a pair. */
  private packets(x: number): Obstacle {
    // after a while packets can come in pairs: a longer duck
    const count = this.metres > 220 && Math.random() < 0.4 ? 2 : 1;
    let o!: Obstacle;
    for (let i = 0; i < count; i++) {
      o = {
        kind: 'packet',
        x: x + i * 16,
        y: GROUND_Y - 12,
        w: 11,
        h: 5,
        vx: OWN_SPEED.packet,
        bits: Array.from({ length: 27 }, () => Math.random() < 0.5),
      };
      this.obstacles.push(o);
    }
    return o;
  }

  private stack(x: number): Obstacle {
    const m = this.metres;
    let rows = 1 + Math.floor(Math.random() * (m < 40 ? 1 : m < 130 ? 2 : 3));
    let cols = Math.random() < 0.35 ? 2 : 1;
    // shrink until a held jump clears it at the current speed
    while (rows + cols > 2 && !clearable(rows * BLOCK_H, cols * BLOCK, this.speed)) {
      if (cols > 1) cols--;
      else rows--;
    }
    const o: Obstacle = { kind: 'stack', x, y: GROUND_Y - rows * BLOCK_H, w: cols * BLOCK, h: rows * BLOCK_H, vx: 0, bits: [] };
    this.obstacles.push(o);
    if (Math.random() < 0.5) this.coinArc(x + o.w / 2, Math.min(o.h + 12, JUMP_PEAK), 5);
    return o;
  }

  /** Coins along a parabola: they hint at the jump. The top one may be an .exe. */
  private coinArc(cx: number, apex: number, n: number) {
    const half = (n - 1) / 2;
    for (let i = 0; i < n; i++) {
      const t = half ? (i - half) / (half + 0.8) : 0;
      const exe = i === Math.floor(half) && Math.random() < 0.15;
      this.pickups.push({ kind: exe ? 'exe' : 'coin', x: cx + (i - half) * 10, y: GROUND_Y - 5 - apex * (1 - t * t), taken: false });
    }
  }

  private coinRow(from: number, to: number) {
    const n = Math.min(6, Math.floor((to - from) / 12));
    const y = GROUND_Y - (Math.random() < 0.3 ? 20 : 5);
    for (let i = 0; i < n; i++)
      this.pickups.push({ kind: Math.random() < 0.06 ? 'exe' : 'coin', x: from + i * 12, y, taken: false });
  }

  /* --------------------------------------------------------------- hero */

  private updateHero(dt: number, input: RunnerInput) {
    const h = this.hero;
    h.buffer = Math.max(0, h.buffer - dt);
    h.coyote = h.grounded ? COYOTE : Math.max(0, h.coyote - dt);
    if (h.buffer > 0 && h.coyote > 0) {
      Object.assign(h, { vy: -JUMP_V, grounded: false, jumping: true, coyote: 0, buffer: 0, holdT: 0 });
      this.hooks.sfx('blip');
    }
    // walked off an edge: the end of a stack, or into a gap
    const floor = this.floorAt(h.y);
    if (h.grounded && (floor === null || floor > h.y)) Object.assign(h, { grounded: false, jumping: false, vy: 0 });
    if (!h.grounded) {
      let g = GRAVITY;
      if (h.jumping && h.vy < 0 && input.jumpHeld && h.holdT < HOLD_MAX) {
        g = HOLD_GRAVITY;
        h.holdT += dt;
      } else h.holdT = HOLD_MAX; // letting go ends the boost for this jump
      if (input.duck) g += FAST_FALL;
      const prev = h.y;
      h.vy += g * dt;
      h.y += h.vy * dt;
      const below = this.floorAt(prev);
      if (h.vy >= 0 && below !== null && h.y >= below) this.land(below);
      else if (h.y > GROUND_Y + 2) this.die('gap');
    }
    h.ducking = h.grounded && input.duck;
    if (h.grounded) h.step += (dt * this.speed) / 9;
  }

  private land(y: number) {
    const h = this.hero;
    if (h.vy > 140) this.burst(HERO_X + 3, y, 4, 't1', 30);
    Object.assign(h, { y, vy: 0, grounded: true, jumping: false });
  }

  /**
   * The highest surface under the hero's feet that is not above `feet`:
   * the top of a { } stack (it can be landed on), the ground, or null when
   * the hero is wholly over a gap.
   */
  private floorAt(feet: number): number | null {
    const x0 = HERO_X + 1;
    const x1 = HERO_X + HERO.w - 1;
    let floor = this.gaps.some((g) => x0 >= g.x && x1 <= g.x + g.w) ? null : GROUND_Y;
    for (const o of this.obstacles) {
      if (o.kind !== 'stack' || x1 <= o.x || x0 >= o.x + o.w || o.y < feet - 0.5) continue;
      floor = floor === null ? o.y : Math.min(floor, o.y);
    }
    return floor;
  }

  heroBox(): { x: number; y: number; w: number; h: number } {
    const d = this.hero.ducking;
    const w = d ? HERO.duckW : HERO.w;
    const h = d ? HERO.duckH : HERO.h;
    return { x: HERO_X, y: this.hero.y - h, w, h };
  }

  private collide() {
    const b = this.heroBox();
    // forgiving hitbox: one pixel in on every side but the feet
    const hit = { x: b.x + 1, y: b.y + 1, w: b.w - 2, h: b.h - 1 };
    for (const o of this.obstacles) {
      const inset = o.kind === 'bug' ? 1 : 0;
      if (overlap(hit, { x: o.x + inset, y: o.y + inset, w: o.w - inset * 2, h: o.h - inset })) return this.die(o.kind);
    }
    for (const p of this.pickups) {
      const half = p.kind === 'exe' ? 6 : 3; // the chip is drawn wider than a coin
      if (p.taken || !overlap(b, { x: p.x - half, y: p.y - 4, w: half * 2, h: 8 })) continue;
      p.taken = true;
      const points = p.kind === 'exe' ? EXE_POINTS : COIN_POINTS;
      if (p.kind === 'exe') this.exes++;
      else this.coins++;
      this.floaters.push({ x: p.x, y: p.y - 4, text: `+${points}`, life: 0.6 });
      this.burst(p.x, p.y, 5, 'hl1', 40);
      this.hooks.sfx('score');
    }
  }

  private die(kind: HazardKind) {
    if (this.death) return;
    this.death = kind;
    this.dying = DEATH_T;
    this.hooks.sfx('hit');
    if (kind !== 'gap') {
      const b = this.heroBox();
      for (let y = b.y; y < b.y + b.h; y += 2)
        for (let x = b.x; x < b.x + b.w; x += 2)
          this.particles.push({ x, y, vx: rand(-70, 50), vy: rand(-90, -10), life: 0.8, max: 0.8, color: 'hl1' });
    }
  }

  private updateDeath(dt: number, kind: HazardKind) {
    const h = this.hero;
    if (kind === 'gap') {
      h.vy += GRAVITY * dt;
      h.y += h.vy * dt;
    }
    this.dying -= dt;
    if (this.dying > 0) return;
    this.over = true;
    this.hooks.over(this.score, `${DEATH_MESSAGE[kind]} · ${this.metres} m · ${this.coins + this.exes} $`, this.metres);
  }

  private updateScore() {
    const s = this.metres + this.coins * COIN_POINTS + this.exes * EXE_POINTS;
    if (s === this.score) return;
    this.score = s;
    this.hooks.score(s);
  }

  private burst(x: number, y: number, n: number, color: keyof Palette, speed: number) {
    for (let i = 0; i < n; i++) {
      const life = rand(0.25, 0.5);
      this.particles.push({ x, y, vx: rand(-speed, speed), vy: rand(-speed, 0), life, max: life, color });
    }
  }

  get deathMessage(): string {
    return this.death ? DEATH_MESSAGE[this.death] : '';
  }
}

function overlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
