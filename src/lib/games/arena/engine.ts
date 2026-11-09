/**
 * Snake Arena: snakes steer freely in a round arena, eat pellets to grow,
 * and die when their head touches another snake's body or the arena wall.
 * A dead snake turns into food. Boosting is faster but burns length.
 *
 * Pure logic (no drawing) so the bots can be tested headless.
 *
 * Bots look along 17 rays for walls and bodies, prefer open space (so they
 * do not get boxed in), chase food, run from bigger snakes nearby, and hunt
 * smaller ones by cutting across the path ahead of their head, boosting to
 * close the gap.
 */

export const ARENA_R = 820;
const SEG = 4.2;
const BASE_SPEED = 62;
const BOOST_SPEED = 118;
const FOOD_TARGET = 650;
const BOTS = 9;
const GRID = 24;
/** A bot reconsiders its course this often (s). */
const THINK = 0.08;

export interface Point {
  x: number;
  y: number;
}

export interface Snake {
  id: number;
  name: string;
  bot: boolean;
  /** Body points, head first. */
  body: Point[];
  angle: number;
  /** Where it wants to point. */
  want: number;
  boost: boolean;
  /** Length in pellets eaten; the body has about mass / 2 + 8 points. */
  mass: number;
  alive: boolean;
  kills: number;
  tone: number;
  think: number;
  /** For bots: a short memory of who they hunt. */
  prey: number | null;
  /** How the snake died, for stats and messages. */
  cause?: 'wall' | 'snake';
  /** Id of the snake it ran into. */
  killedBy?: number;
}

export interface Food extends Point {
  value: number;
  /** Bigger, brighter pellets from a dead snake. */
  rich: boolean;
}

export interface World {
  snakes: Snake[];
  food: Food[];
  nextId: number;
  time: number;
  random: () => number;
  /** Spatial hash of body points: cell key -> flat [snake index, x, y, ...] (a copy, so moving snakes do not disturb it). */
  grid: Map<number, number[]>;
  events: { kind: 'eat' | 'kill' | 'die'; snake: number; other?: number }[];
}

const BOT_NAMES = ['Viper', 'Mamba', 'Cobra', 'Krait', 'Taipan', 'Boa', 'Python', 'Adder', 'Asp', 'Racer', 'Garter', 'Sidewinder'];

export const radius = (s: Snake) => 3 + Math.min(7, Math.sqrt(s.mass) * 0.3);
/** Body points: grows with mass, up to a cap (past it a snake only gets thicker). */
const targetPoints = (s: Snake) => Math.floor(Math.min(170, 8 + s.mass / 2));
const turnRate = (s: Snake) => Math.max(2.2, 4.6 - Math.sqrt(s.mass) * 0.12);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const cellKey = (cx: number, cy: number) => (cx + 512) * 4096 + (cy + 512);

export function newWorld(random: () => number = Math.random): World {
  const w: World = { snakes: [], food: [], nextId: 1, time: 0, random, grid: new Map(), events: [] };
  while (w.food.length < FOOD_TARGET) addFood(w);
  return w;
}

function randomPoint(w: World, within = ARENA_R - 40): Point {
  const a = w.random() * Math.PI * 2;
  const r = Math.sqrt(w.random()) * within;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}

function addFood(w: World, at?: Point, value = 1, rich = false) {
  const p = at ?? randomPoint(w, ARENA_R - 10);
  w.food.push({ x: p.x, y: p.y, value, rich });
}

/** A spot at least `away` from every snake head and body. */
function safeSpot(w: World, away: number): Point {
  let best = randomPoint(w);
  let bestD = -1;
  for (let i = 0; i < 30; i++) {
    const p = randomPoint(w, ARENA_R - 80);
    let d = Infinity;
    for (const s of w.snakes) if (s.alive) for (let k = 0; k < s.body.length; k += 3) d = Math.min(d, Math.hypot(s.body[k].x - p.x, s.body[k].y - p.y));
    if (d > away) return p;
    if (d > bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

export function addSnake(w: World, bot: boolean, mass = 10, name?: string): Snake {
  const at = safeSpot(w, 140);
  const angle = Math.atan2(-at.y, -at.x) + (w.random() - 0.5); // roughly towards the middle
  const s: Snake = {
    id: w.nextId++,
    name: name ?? BOT_NAMES[Math.floor(w.random() * BOT_NAMES.length)],
    bot,
    body: [],
    angle,
    want: angle,
    boost: false,
    mass,
    alive: true,
    kills: 0,
    tone: Math.floor(w.random() * 5),
    think: 0,
    prey: null,
  };
  for (let i = 0; i < targetPoints(s); i++) s.body.push({ x: at.x - Math.cos(angle) * SEG * i, y: at.y - Math.sin(angle) * SEG * i });
  w.snakes.push(s);
  return s;
}

/* ------------------------------------------------------------ spatial hash */

function rebuildGrid(w: World) {
  w.grid.clear();
  w.snakes.forEach((s, si) => {
    if (!s.alive) return;
    s.body.forEach((p) => {
      const k = cellKey(Math.floor(p.x / GRID), Math.floor(p.y / GRID));
      const cell = w.grid.get(k);
      if (cell) cell.push(si, p.x, p.y);
      else w.grid.set(k, [si, p.x, p.y]);
    });
  });
}

/**
 * The first body point of another snake within `reach` of (x, y), ignoring
 * snake `self` (snakes never hit themselves here). Returns its snake index.
 */
function bodyNear(w: World, x: number, y: number, reach: number, self: number): number {
  const c0 = Math.floor((x - reach) / GRID);
  const c1 = Math.floor((x + reach) / GRID);
  const r0 = Math.floor((y - reach) / GRID);
  const r1 = Math.floor((y + reach) / GRID);
  for (let cx = c0; cx <= c1; cx++)
    for (let cy = r0; cy <= r1; cy++) {
      const cell = w.grid.get(cellKey(cx, cy));
      if (!cell) continue;
      for (let i = 0; i < cell.length; i += 3) {
        const si = cell[i];
        if (si === self) continue;
        const r = reach + radius(w.snakes[si]) - 3;
        if ((cell[i + 1] - x) ** 2 + (cell[i + 2] - y) ** 2 < r * r) return si;
      }
    }
  return -1;
}

/* ---------------------------------------------------------------- the bots */

/** Where the other snakes' heads are heading: the stretch each will cover in the next half second. */
interface HeadPath {
  x: number;
  y: number;
  dx: number;
  dy: number;
  len: number;
  r: number;
}

function headPaths(w: World, si: number): HeadPath[] {
  const out: HeadPath[] = [];
  w.snakes.forEach((o, oi) => {
    if (oi === si || !o.alive) return;
    const h = o.body[0];
    out.push({ x: h.x, y: h.y, dx: Math.cos(o.angle), dy: Math.sin(o.angle), len: (o.boost ? BOOST_SPEED : BASE_SPEED) * 0.5, r: radius(o) });
  });
  return out;
}

function nearPath(x: number, y: number, p: HeadPath, reach: number): boolean {
  const t = Math.max(0, Math.min(p.len, (x - p.x) * p.dx + (y - p.y) * p.dy));
  const px = p.x + p.dx * t;
  const py = p.y + p.dy * t;
  const r = reach + p.r + 4;
  return (x - px) ** 2 + (y - py) ** 2 < r * r;
}

/**
 * How far a snake can go along an angle before hitting a body, the wall, or
 * the path another snake's head is about to take (up to `max`).
 */
function clearance(w: World, si: number, angle: number, max: number, heads: HeadPath[]): number {
  const s = w.snakes[si];
  const h = s.body[0];
  const r = radius(s);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  for (let d = 6; d <= max; d += 6) {
    const x = h.x + dx * d;
    const y = h.y + dy * d;
    if (x * x + y * y > (ARENA_R - r - 4) ** 2) return d;
    if (bodyNear(w, x, y, r + 4, si) >= 0) return d;
    if (d < 80 && heads.some((p) => nearPath(x, y, p, r))) return d;
  }
  return max;
}

const RAYS = 17;

function think(w: World, si: number) {
  const s = w.snakes[si];
  const h = s.body[0];
  const r = radius(s);
  const look = 150 + r * 6;

  // threats and prey around
  let threat: Snake | null = null;
  let threatD = Infinity;
  let prey: Snake | null = null;
  let preyD = Infinity;
  for (const o of w.snakes) {
    if (o === s || !o.alive) continue;
    const oh = o.body[0];
    const d = Math.hypot(oh.x - h.x, oh.y - h.y);
    if (d > look) continue;
    if (o.mass > s.mass * 0.9 && d < 110 && d < threatD) {
      threat = o;
      threatD = d;
    } else if (s.mass > o.mass * 1.25 && d < preyD) {
      prey = o;
      preyD = d;
    }
  }
  s.prey = prey?.id ?? null;

  // food: the best pellet nearby, worth more when rich and close
  let food: Food | null = null;
  let foodScore = 0;
  for (const f of w.food) {
    const d = Math.hypot(f.x - h.x, f.y - h.y);
    if (d > look) continue;
    const sc = (f.value * (f.rich ? 2 : 1)) / (d + 15);
    if (sc > foodScore) {
      foodScore = sc;
      food = f;
    }
  }

  // where it would like to go
  let goal: Point | null = food;
  if (prey) {
    const ph = prey.body[0];
    const px = Math.cos(prey.angle);
    const py = Math.sin(prey.angle);
    // how far ahead of the prey's head the bot is, and on which side
    const along = (h.x - ph.x) * px + (h.y - ph.y) * py;
    const side = Math.sign((h.x - ph.x) * -py + (h.y - ph.y) * px) || 1;
    const gap = 26 + r * 2 + radius(prey) * 2;
    if (along < 8) {
      // still behind: run alongside, a safe gap off its body, and overtake
      goal = { x: ph.x + px * 40 + -py * side * gap, y: ph.y + py * 40 + px * side * gap };
    } else {
      // level or ahead: cut across in front of its head
      const lead = 26 + radius(prey) * 3;
      goal = { x: ph.x + px * lead, y: ph.y + py * lead };
    }
  }
  if (!goal) goal = { x: -h.x * 0.3, y: -h.y * 0.3 }; // drift towards the middle

  const heads = headPaths(w, si);
  let best = s.angle;
  let bestScore = -Infinity;
  let bestClear = 0;
  for (let i = 0; i < RAYS; i++) {
    const a = s.angle + ((i - (RAYS - 1) / 2) / ((RAYS - 1) / 2)) * Math.PI * 0.95;
    const clear = clearance(w, si, a, look, heads);
    // open space ahead, judged a little further along too (avoid pockets)
    let score = clear / look;
    if (clear >= look * 0.6) {
      const mid = { x: h.x + Math.cos(a) * clear * 0.5, y: h.y + Math.sin(a) * clear * 0.5 };
      let side = 0;
      for (const da of [-0.9, 0.9]) {
        const bx = Math.cos(a + da);
        const by = Math.sin(a + da);
        let d = 8;
        for (; d < 90; d += 8) {
          const x = mid.x + bx * d;
          const y = mid.y + by * d;
          if (x * x + y * y > (ARENA_R - 10) ** 2 || bodyNear(w, x, y, r, si) >= 0) break;
        }
        side += d / 90;
      }
      score += side * 0.25;
    }
    // about to hit something: the room needed grows with speed (a boosting snake turns wider)
    const speed = s.boost ? BOOST_SPEED : BASE_SPEED;
    const danger = speed * 0.55 + r * 2 + 10;
    if (clear < danger) score -= 2 + (danger - clear) / danger;
    const toGoal = Math.atan2(goal.y - h.y, goal.x - h.x);
    score += Math.cos(wrap(a - toGoal)) * (prey ? 0.55 : 0.4);
    if (threat) {
      const th = threat.body[0];
      const toThreat = Math.atan2(th.y - h.y, th.x - h.x);
      score -= Math.max(0, Math.cos(wrap(a - toThreat))) * 0.7 * (1 - threatD / 110);
    }
    score -= Math.abs(wrap(a - s.angle)) * 0.05; // prefer smooth turns
    if (score > bestScore) {
      bestScore = score;
      best = a;
      bestClear = clear;
    }
  }
  s.want = best;
  // boost to finish a cut, or to run: only on a nearly straight line with
  // plenty of room ahead (a fast snake needs far more space to turn)
  const straight = Math.abs(wrap(best - s.angle)) < 0.35;
  const room = bestClear >= Math.min(look, BOOST_SPEED * 1.1);
  s.boost = s.mass > 24 && straight && room && ((prey !== null && preyD < 90) || (threat !== null && threatD < 60));
}

/* ------------------------------------------------------------------- step */

export interface PlayerInput {
  /** Turn direction from keys (-1 left, 1 right). */
  turn: -1 | 0 | 1;
  /** Absolute direction to steer to (pointer), when set. */
  aim: number | null;
  boost: boolean;
}

function kill(w: World, si: number, cause: 'wall' | 'snake', by?: number) {
  const s = w.snakes[si];
  if (!s.alive) return;
  s.alive = false;
  s.cause = cause;
  s.killedBy = by !== undefined ? w.snakes[by].id : undefined;
  // the body becomes food
  const each = Math.max(1, Math.round(s.mass / Math.max(1, s.body.length / 2)));
  for (let i = 0; i < s.body.length; i += 2) {
    const p = s.body[i];
    addFood(w, { x: p.x + (w.random() - 0.5) * 6, y: p.y + (w.random() - 0.5) * 6 }, each, true);
  }
  w.events.push({ kind: 'die', snake: s.id });
  if (by !== undefined) {
    const k = w.snakes[by];
    k.kills++;
    w.events.push({ kind: 'kill', snake: k.id, other: s.id });
  }
}

export function stepWorld(w: World, dt: number, input: PlayerInput | null) {
  w.time += dt;
  w.events = [];
  rebuildGrid(w);

  w.snakes.forEach((s, si) => {
    if (!s.alive) return;
    if (s.bot) {
      s.think -= dt;
      if (s.think <= 0) {
        s.think = THINK;
        think(w, si);
      }
    } else if (input) {
      if (input.aim !== null) s.want = input.aim;
      else if (input.turn) s.want = s.angle + input.turn * 1.2;
      else s.want = s.angle;
      s.boost = input.boost && s.mass > 12;
    }
    const diff = wrap(s.want - s.angle);
    if (s.bot && Math.abs(diff) > 0.5) s.boost = false; // never boost through a hard turn
    const maxTurn = turnRate(s) * dt;
    s.angle = wrap(s.angle + Math.max(-maxTurn, Math.min(maxTurn, diff)));

    const boosting = s.boost && s.mass > 12;
    const speed = boosting ? BOOST_SPEED : BASE_SPEED;
    if (boosting) {
      const burn = 5 * dt;
      s.mass -= burn;
      // leave a little food behind now and then
      if (w.random() < dt * 3) {
        const t = s.body[s.body.length - 1];
        addFood(w, { x: t.x, y: t.y }, 1, false);
      }
    }
    const h = s.body[0];
    const nh = { x: h.x + Math.cos(s.angle) * speed * dt, y: h.y + Math.sin(s.angle) * speed * dt };
    s.body.unshift(nh);
    // the rest follows the head like a chain, one segment apart
    for (let i = 1; i < s.body.length; i++) {
      const a = s.body[i - 1];
      const b = s.body[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      b.x = a.x + (dx / d) * SEG;
      b.y = a.y + (dy / d) * SEG;
    }
    // unshift added a point: keep the length the mass asks for
    const want = targetPoints(s);
    while (s.body.length > want) s.body.pop();
    if (s.body.length < want) {
      const t = s.body[s.body.length - 1];
      s.body.push({ x: t.x, y: t.y });
    }
  });

  // collisions (against the grid built at the start of the step)
  rebuildGrid(w);
  w.snakes.forEach((s, si) => {
    if (!s.alive) return;
    const h = s.body[0];
    const r = radius(s);
    if (h.x * h.x + h.y * h.y > (ARENA_R - r) ** 2) return kill(w, si, 'wall');
    const hit = bodyNear(w, h.x, h.y, r * 0.8, si);
    if (hit >= 0) kill(w, si, 'snake', hit);
  });

  // eating
  for (const s of w.snakes) {
    if (!s.alive) continue;
    const h = s.body[0];
    const reach = radius(s) + 5;
    w.food = w.food.filter((f) => {
      if ((f.x - h.x) ** 2 + (f.y - h.y) ** 2 > reach * reach) return true;
      s.mass += f.value;
      w.events.push({ kind: 'eat', snake: s.id });
      return false;
    });
  }
  while (w.food.length < FOOD_TARGET) addFood(w);
  if (w.food.length > FOOD_TARGET * 3) w.food.splice(0, w.food.length - FOOD_TARGET * 3);

  // new bots take the place of dead ones
  w.snakes = w.snakes.filter((s) => s.alive || !s.bot);
  while (w.snakes.filter((s) => s.bot).length < BOTS) addSnake(w, true, 10 + Math.floor(w.random() * 40));
}

/** The longest snakes first. */
export function leaderboard(w: World): Snake[] {
  return w.snakes.filter((s) => s.alive).sort((a, b) => b.mass - a.mass);
}
