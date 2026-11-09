/**
 * Car Racing traffic, kept apart from drawing so it can be tested.
 *
 * Rules the other cars follow:
 * - they never hit each other: each car keeps a gap to the car ahead in any
 *   lane it is in or moving into, slowing down as it closes in, with a hard
 *   minimum gap as a last resort;
 * - lane changes are smooth and announced: the indicator blinks first, then
 *   the car glides across with easing. A change only starts when the target
 *   lane is clear in front and behind, and is called off if it fills up;
 * - there is always a way through for the player: three cars never line up
 *   across all lanes closer than a car can slip between. This is checked a
 *   few seconds ahead before a car is added or starts a lane change, and
 *   speeds are nudged so such a line never forms on its own.
 *
 * Distances are in road units along the track (d grows forwards).
 */

export const LANES = 3;
export const CAR_H = 15;
/** Shortest bumper-to-bumper gap a car keeps to the car ahead. */
export const MIN_GAP = 4;
/** Gap at which a car starts easing off behind a slower one. */
export const FOLLOW_GAP = CAR_H * 2;
/** Room the player needs between cars to get through, bumper to bumper. */
export const ESCAPE_GAP = CAR_H + 14;
/** How long the indicator blinks before a car starts to move over (s). */
export const SIGNAL_TIME = 0.8;
/** How long the move to the next lane takes (s). */
export const CHANGE_TIME = 0.9;
/** How far ahead (s) walls of cars are predicted. */
export const HORIZON = 2.5;

export interface Car {
  id: number;
  d: number;
  speed: number;
  /** The speed it would like to drive. */
  cruise: number;
  /** The lane it is in (or leaving). */
  lane: number;
  /** The lane it is moving to; equal to lane when not changing. */
  target: number;
  /** Seconds of blinking left before moving (0 when moving or not changing). */
  signalT: number;
  /** Seconds spent blinking so far (a change that cannot start in time is called off). */
  waited: number;
  /** 0..1 through the move to the target lane. */
  progress: number;
  tone: number;
  passed: boolean;
}

export interface Traffic {
  cars: Car[];
  nextId: number;
  /** Random numbers in [0,1); swap for a seeded one in tests. */
  random: () => number;
}

export function newTraffic(random: () => number = Math.random): Traffic {
  return { cars: [], nextId: 1, random };
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Where a car is across the road, in lanes (0 = left lane), easing during a change. */
export function lanePos(c: Car): number {
  if (c.target === c.lane || c.signalT > 0) return c.lane;
  return c.lane + (c.target - c.lane) * smooth(Math.min(1, c.progress));
}

/** The lanes a car takes up: its own, plus the target once it signals (so others make room). */
export function lanesOf(c: Car): number[] {
  return c.target === c.lane ? [c.lane] : [c.lane, c.target];
}

/** The lanes a car is physically in right now: both only while it is moving across. */
export function physicalLanes(c: Car): number[] {
  return c.target !== c.lane && c.signalT <= 0 ? [c.lane, c.target] : [c.lane];
}

const sharesLane = (a: Car, b: Car) => lanesOf(a).some((l) => lanesOf(b).includes(l));

/** Whether a lane is clear from `back` behind to `front` ahead of distance d (ignoring car `self`). */
export function laneClear(t: Traffic, lane: number, d: number, back: number, front: number, self?: Car): boolean {
  return !t.cars.some((o) => o !== self && lanesOf(o).includes(lane) && o.d > d - back - CAR_H && o.d < d + front + CAR_H);
}

/**
 * Whether the cars would form a wall at time `ahead` seconds from now: every
 * lane taken by a car within one stretch shorter than ESCAPE_GAP + CAR_H, so
 * nothing can get through. Uses each car's current speed. Cautious by
 * default (a car counts in the lane it signals for); `physical` counts only
 * where cars really are, which is what the player can drive through.
 */
export function wallAt(cars: Car[], ahead: number, physical = false, margin = 0): Car[] | null {
  const lanesFor = physical ? physicalLanes : lanesOf;
  const at = cars.map((c) => ({ c, d: c.d + c.speed * ahead })).sort((a, b) => a.d - b.d);
  for (let i = 0; i < at.length; i++) {
    const lanes = new Set<number>();
    const group: Car[] = [];
    for (let j = i; j < at.length && at[j].d - at[i].d < CAR_H + ESCAPE_GAP + margin; j++) {
      for (const l of lanesFor(at[j].c)) lanes.add(l);
      group.push(at[j].c);
      if (lanes.size >= LANES) return group;
    }
  }
  return null;
}

/** Whether these cars stay passable for the next HORIZON seconds. */
export function staysPassable(cars: Car[]): boolean {
  for (let s = 0; s <= HORIZON; s += 0.25) if (wallAt(cars, s, false, 4)) return false;
  return true;
}

/**
 * Add a car at distance d, in a lane chosen at random among those where it
 * fits: clear around it and leaving a way through. Returns null when no lane
 * works (then no car is added this time).
 */
export function spawn(t: Traffic, d: number, cruise: number, tone: number): Car | null {
  const lanes = [0, 1, 2].sort(() => t.random() - 0.5);
  for (const lane of lanes) {
    if (!laneClear(t, lane, d, CAR_H * 2.5, CAR_H * 2.5)) continue;
    const car: Car = { id: t.nextId, d, speed: cruise, cruise, lane, target: lane, signalT: 0, waited: 0, progress: 0, tone, passed: false };
    if (!staysPassable([...t.cars, car])) continue;
    t.nextId++;
    t.cars.push(car);
    return car;
  }
  return null;
}

/** Try to start a lane change for a car: only into a clear lane, and never closing the way through. */
function tryChange(t: Traffic, c: Car, dir: -1 | 1): boolean {
  const to = c.lane + dir;
  if (to < 0 || to >= LANES || c.target !== c.lane) return false;
  if (!laneClear(t, to, c.d, CAR_H * 2.2, CAR_H * 2.2, c)) return false;
  const was = c.target;
  c.target = to;
  if (!staysPassable(t.cars)) {
    c.target = was;
    return false;
  }
  c.signalT = SIGNAL_TIME;
  c.waited = 0;
  c.progress = 0;
  return true;
}

/** The nearest car ahead sharing a lane with c, and the bumper gap to it. */
function leaderOf(t: Traffic, c: Car): { car: Car; gap: number } | null {
  let best: { car: Car; gap: number } | null = null;
  for (const o of t.cars) {
    if (o === c || o.d < c.d || !sharesLane(c, o)) continue;
    if (o.d === c.d && o.id < c.id) continue; // a tie: the older car leads
    const gap = o.d - c.d - CAR_H;
    if (!best || gap < best.gap) best = { car: o, gap };
  }
  return best;
}

/** Advance traffic by dt. A higher `level` means more lane changes. */
export function stepTraffic(t: Traffic, dt: number, level: number): void {
  const cars = [...t.cars].sort((a, b) => b.d - a.d); // front first

  // Keep a way through: if a wall is coming, ease the car that is closing in.
  // (with a wider margin than spawning uses, so speeds change before it gets tight)
  for (let s = 0; s <= HORIZON; s += 0.5) {
    const wall = wallAt(t.cars, s, false, 12);
    if (!wall) continue;
    const sorted = [...wall].sort((a, b) => a.d - b.d);
    const back = sorted[0];
    const front = sorted[sorted.length - 1];
    // the back car hangs back, the front car pulls away a little
    back.cruise = Math.min(back.cruise, front.speed - 12);
    front.cruise = Math.max(front.cruise, back.speed + 6);
    break;
  }

  for (const c of cars) {
    // speed: cruise, or ease off behind a car in the way
    let want = c.cruise;
    const lead = leaderOf(t, c);
    if (lead && lead.gap < FOLLOW_GAP) {
      const closing = (FOLLOW_GAP - lead.gap) / FOLLOW_GAP;
      want = Math.min(want, lead.car.speed - closing * 25);
      // stuck behind a slower car: think about overtaking
      if (c.target === c.lane && lead.car.speed < c.cruise - 8 && t.random() < dt * 0.8) {
        tryChange(t, c, t.random() < 0.5 ? -1 : 1) || tryChange(t, c, c.lane === 0 ? 1 : -1);
      }
    }
    const accel = want > c.speed ? 25 : 90;
    c.speed += Math.max(-accel * dt, Math.min(accel * dt, want - c.speed));
    if (c.speed < 10) c.speed = 10;
    c.d += c.speed * dt;
    if (lead) {
      // hard limit: never closer than MIN_GAP
      const limit = lead.car.d - CAR_H - MIN_GAP;
      if (c.d > limit) {
        c.d = limit;
        c.speed = Math.min(c.speed, lead.car.speed);
      }
    }

    // lane changes
    if (c.target !== c.lane) {
      if (c.signalT > 0) {
        c.signalT -= dt;
        c.waited += dt;
        const clear = laneClear(t, c.target, c.d, CAR_H * 1.6, CAR_H * 1.6, c);
        if (c.signalT <= 0 && clear && !staysPassable(t.cars)) {
          // moving now would close the way through: keep blinking and wait
          c.signalT = 0.1;
        }
        // the lane filled up, or it waited too long: call it off
        if (!clear || c.waited > SIGNAL_TIME + 1.5) {
          c.target = c.lane;
          c.signalT = 0;
        }
      } else {
        c.progress += dt / CHANGE_TIME;
        if (c.progress >= 1) {
          c.lane = c.target;
          c.progress = 0;
        }
      }
    } else if (t.random() < dt * 0.12 * level) {
      tryChange(t, c, t.random() < 0.5 ? -1 : 1);
    }
  }
}
