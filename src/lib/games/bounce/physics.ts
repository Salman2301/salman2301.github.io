/**
 * Bounce ball physics, kept apart from drawing so it can be tested.
 *
 * The ball collides as a circle against square tiles: against a flat wall it
 * stops, but at a corner it is pushed out along the corner's direction and
 * keeps the rest of its speed, so it rolls over a ledge edge instead of
 * snagging on it. Movement is split into small steps so a fast ball never
 * skips into a tile.
 */

export const T = 8;

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  grounded: boolean;
  /** Seconds since the ball last stood on something (for coyote time). */
  air: number;
  /** Seconds left on a jump pressed just before landing. */
  buffer: number;
}

export interface Input {
  dir: -1 | 0 | 1;
  /** The jump key is held. */
  up: boolean;
  /** The jump key went down this frame. */
  upPressed: boolean;
}

export type TileAt = (tx: number, ty: number) => string;
export const solid = (c: string) => c === '#' || c === '=';

export const TUNING = {
  maxSpeed: 62,
  groundAccel: 420,
  airAccel: 300,
  gravity: 400,
  maxFall: 260,
  jump: 168,
  rubber: 235,
  /** Landing faster than this bounces back a little (when not jumping again). */
  bounceAbove: 140,
  bounceKeep: 0.32,
  /** A jump still works this long after rolling off a ledge. */
  coyote: 0.09,
  /** A jump pressed this long before landing still happens. */
  bufferTime: 0.12,
  /** Longest move per sub-step, in px (well under the ball's radius). */
  maxStep: 1.5,
};

export function newBall(x: number, y: number): Ball {
  return { x, y, vx: 0, vy: 0, r: 3.2, grounded: false, air: 0, buffer: 0 };
}

export type BallEvent = 'jump' | 'rubber' | 'bounce' | 'land';

interface Contact {
  nx: number;
  ny: number;
  pen: number;
  tile: string;
  /** The tile's top edge (y), for corner correction. */
  top: number;
  /** The tile above is free, so the ball can be lifted onto this one. */
  openAbove: boolean;
  /** The tile below is free (the ball can drop past this one). */
  openBelow: boolean;
}

/** The deepest overlap between the ball and a solid tile, if any. */
function deepest(b: Ball, tile: TileAt): Contact | null {
  let best: Contact | null = null;
  const x0 = Math.floor((b.x - b.r) / T);
  const x1 = Math.floor((b.x + b.r) / T);
  const y0 = Math.floor((b.y - b.r) / T);
  const y1 = Math.floor((b.y + b.r) / T);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) {
      const c = tile(tx, ty);
      if (!solid(c)) continue;
      const left = tx * T;
      const top = ty * T;
      const px = Math.max(left, Math.min(b.x, left + T));
      const py = Math.max(top, Math.min(b.y, top + T));
      let dx = b.x - px;
      let dy = b.y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 >= b.r * b.r) continue;
      let d = Math.sqrt(d2);
      let pen: number;
      if (d < 1e-6) {
        // Centre inside the tile (should not happen with small steps): out through the nearest face.
        const faces = [
          { nx: -1, ny: 0, p: b.x - left },
          { nx: 1, ny: 0, p: left + T - b.x },
          { nx: 0, ny: -1, p: b.y - top },
          { nx: 0, ny: 1, p: top + T - b.y },
        ].sort((a, z) => a.p - z.p)[0];
        dx = faces.nx;
        dy = faces.ny;
        d = 1;
        pen = faces.p + b.r;
      } else pen = b.r - d;
      // A face shared with another solid tile is inside a wall: never push along it.
      const nx = Math.abs(dx) < 1e-9 ? 0 : dx / d;
      const ny = Math.abs(dy) < 1e-9 ? 0 : dy / d;
      if (Math.abs(nx) > 0.99 && solid(tile(tx + Math.sign(nx), ty))) continue;
      if (Math.abs(ny) > 0.99 && solid(tile(tx, ty + Math.sign(ny)))) continue;
      if (!best || pen > best.pen) best = { nx, ny, pen, tile: c, top, openAbove: !solid(tile(tx, ty - 1)), openBelow: !solid(tile(tx, ty + 1)) };
    }
  return best;
}

/** Push the ball out of tiles and turn its velocity the way a ball would. */
function resolve(b: Ball, tile: TileAt, input: Input, events: BallEvent[]) {
  for (let i = 0; i < 4; i++) {
    const c = deepest(b, tile);
    if (!c) return;
    if (Math.abs(c.nx) > 0.01 && Math.abs(c.ny) > 0.01) {
      // A corner, not a face. Resolve it up or down so it never costs
      // sideways speed: above the ledge, lift the ball onto it (less than a
      // radius); under it, treat it as a ceiling.
      if (c.ny < 0 && c.openAbove) {
        b.y = c.top - b.r;
        c.nx = 0;
        c.ny = -1;
        c.pen = 0;
      } else if (c.ny > 0) {
        b.y = c.top + T + b.r;
        c.nx = 0;
        c.ny = 1;
        c.pen = 0;
      }
    }
    b.x += c.nx * c.pen;
    b.y += c.ny * c.pen;
    const vn = b.vx * c.nx + b.vy * c.ny;
    if (vn >= 0) continue; // already moving away
    if (c.ny < -0.6) {
      // standing on it (a floor, or the top of a corner)
      const falling = b.vy;
      if (c.tile === '=') {
        b.vy = -TUNING.rubber;
        events.push('rubber');
      } else if ((input.up || b.buffer > 0) && falling > 0) {
        // jump straight off the landing instead of a little bounce
        b.vy = -TUNING.jump;
        b.buffer = 0;
        events.push('jump');
      } else if (falling > TUNING.bounceAbove) {
        b.vx -= c.nx * vn;
        b.vy = -falling * TUNING.bounceKeep;
        events.push('bounce');
      } else {
        b.vx -= c.nx * vn;
        b.vy -= c.ny * vn;
        if (b.vy > 0) b.vy = 0;
        if (!b.grounded && falling > 40) events.push('land');
        b.grounded = true;
        b.air = 0;
      }
    } else if (c.ny === 0 && b.vy < 0 && c.openAbove && b.y - c.top < b.r * 1.25) {
      // Rising past the top of a ledge: held back for a moment, but keeps its
      // speed, so it carries on over the ledge instead of stopping and dropping.
    } else if (c.ny === 0 && b.vy > 0 && c.openBelow && c.top + T - b.y < b.r * 1.25) {
      // Falling past the bottom of a floating ledge: the same, the other way.
    } else {
      // a wall or a ceiling: lose only the speed into it
      b.vx -= c.nx * vn;
      b.vy -= c.ny * vn;
    }
  }
}

/** Advance the ball by dt seconds. Returns what happened, for sounds. */
export function stepBall(b: Ball, input: Input, tile: TileAt, dt: number): BallEvent[] {
  const events: BallEvent[] = [];
  const wasGrounded = b.grounded;
  if (input.upPressed) b.buffer = TUNING.bufferTime;
  else b.buffer = Math.max(0, b.buffer - dt);
  b.air = wasGrounded ? 0 : b.air + dt;

  const accel = wasGrounded ? TUNING.groundAccel : TUNING.airAccel;
  if (input.dir) b.vx = Math.max(-TUNING.maxSpeed, Math.min(TUNING.maxSpeed, b.vx + input.dir * accel * dt));
  else b.vx *= wasGrounded ? Math.pow(0.0008, dt) : Math.pow(0.4, dt);

  if ((input.up || b.buffer > 0) && (wasGrounded || b.air < TUNING.coyote) && b.vy >= 0) {
    b.vy = -TUNING.jump;
    b.buffer = 0;
    b.air = TUNING.coyote; // one jump per take-off
    events.push('jump');
  }
  b.vy = Math.min(b.vy + TUNING.gravity * dt, TUNING.maxFall);
  b.grounded = false;

  const dist = Math.max(Math.abs(b.vx), Math.abs(b.vy)) * dt;
  const steps = Math.max(1, Math.ceil(dist / TUNING.maxStep));
  const sub = dt / steps;
  for (let s = 0; s < steps; s++) {
    b.x += b.vx * sub;
    b.y += b.vy * sub;
    resolve(b, tile, input, events);
  }
  // Rolling along the floor: stay grounded even on a frame where the tiny
  // gravity push did not reach the tile.
  if (!b.grounded && b.vy >= 0 && b.vy < 30) {
    const probe = { ...b, y: b.y + 0.5 };
    const c = deepest(probe, tile);
    if (c && c.ny < -0.6) {
      b.grounded = true;
      b.air = 0;
    }
  }
  return events;
}
