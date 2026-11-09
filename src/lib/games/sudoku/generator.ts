/**
 * Sudoku generation, solving and grading. Pure TypeScript with no DOM access,
 * so it runs the same in the browser and in node tests.
 *
 * A puzzle is made in two steps: a random solved grid from randomized
 * backtracking, then clues are removed in symmetric pairs as long as the
 * puzzle keeps exactly one solution. Difficulty is graded by the techniques a
 * person needs, not just by the number of clues:
 *
 *   level 1  naked singles only (a cell with one candidate left)
 *   level 2  hidden singles (a digit with one possible cell in a unit)
 *   level 3  locked candidates, naked pairs and hidden pairs
 *   level 4  needs something stronger (or trial and error)
 *
 * Grids are arrays of 81 digits in row-major order, 0 for an empty cell.
 * Candidate sets are 9-bit masks: bit (d - 1) set means digit d is possible.
 */

export type Difficulty = 'easy' | 'medium' | 'hard';
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

export type Grid = number[];

export interface Puzzle {
  difficulty: Difficulty;
  givens: Grid;
  solution: Grid;
  /** Technique level needed to solve it (see the module comment). */
  level: number;
  clues: number;
}

export const ALL = 0x1ff;
export const STUCK = 4;

export const ROW_OF = Uint8Array.from({ length: 81 }, (_, i) => Math.floor(i / 9));
export const COL_OF = Uint8Array.from({ length: 81 }, (_, i) => i % 9);
export const BOX_OF = Uint8Array.from({ length: 81 }, (_, i) => Math.floor(i / 27) * 3 + Math.floor((i % 9) / 3));

const range9 = Array.from({ length: 9 }, (_, i) => i);
const ROWS = range9.map((r) => range9.map((c) => r * 9 + c));
const COLS = range9.map((c) => range9.map((r) => r * 9 + c));
/** Cells of each 3x3 box, in reading order. */
export const BOXES = range9.map((b) => range9.map((k) => (Math.floor(b / 3) * 3 + Math.floor(k / 3)) * 9 + (b % 3) * 3 + (k % 3)));

/** The 27 units: rows 0-8, columns 9-17, boxes 18-26. */
export const UNITS: number[][] = [...ROWS, ...COLS, ...BOXES];
/** For each cell, the 20 other cells that share a row, column or box with it. */
export const PEERS: number[][] = range9
  .flatMap((r) => range9.map((c) => r * 9 + c))
  .map((i) => {
    const set = new Set([...ROWS[ROW_OF[i]], ...COLS[COL_OF[i]], ...BOXES[BOX_OF[i]]]);
    set.delete(i);
    return [...set];
  });

const POP = Uint8Array.from({ length: 512 }, (_, m) => {
  let n = 0;
  for (let x = m; x; x &= x - 1) n++;
  return n;
});

export const popcount = (mask: number) => POP[mask & ALL];
/** Digit of a single-bit mask. */
export const digitOf = (bit: number) => 32 - Math.clz32(bit);
export const bitOf = (digit: number) => 1 << (digit - 1);

/* ------------------------------------------------------------------ random */

export type Rand = () => number;

/** Small seeded PRNG (mulberry32), for reproducible puzzles and tests. */
export function seededRandom(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(list: T[], rand: Rand): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/* ------------------------------------------------------------------ solver */

interface Search {
  grid: Uint8Array;
  rows: Uint16Array;
  cols: Uint16Array;
  boxes: Uint16Array;
  limit: number;
  count: number;
  solution: Uint8Array | null;
  rand: Rand | null;
}

/** Set up search state, or null when the givens already break the rules. */
function prepare(grid: ArrayLike<number>, limit: number, rand: Rand | null): Search | null {
  const s: Search = {
    grid: Uint8Array.from(grid),
    rows: new Uint16Array(9),
    cols: new Uint16Array(9),
    boxes: new Uint16Array(9),
    limit,
    count: 0,
    solution: null,
    rand,
  };
  for (let i = 0; i < 81; i++) {
    const d = s.grid[i];
    if (!d) continue;
    const bit = bitOf(d);
    if ((s.rows[ROW_OF[i]] | s.cols[COL_OF[i]] | s.boxes[BOX_OF[i]]) & bit) return null;
    s.rows[ROW_OF[i]] |= bit;
    s.cols[COL_OF[i]] |= bit;
    s.boxes[BOX_OF[i]] |= bit;
  }
  return s;
}

/** Depth-first search that always branches on the cell with the fewest candidates. */
function search(s: Search): void {
  let best = -1;
  let bestMask = 0;
  let bestN = 10;
  for (let i = 0; i < 81; i++) {
    if (s.grid[i]) continue;
    const mask = ALL & ~(s.rows[ROW_OF[i]] | s.cols[COL_OF[i]] | s.boxes[BOX_OF[i]]);
    const n = POP[mask];
    if (n < bestN) {
      best = i;
      bestMask = mask;
      bestN = n;
      if (n < 2) break;
    }
  }
  if (best < 0) {
    s.count++;
    if (!s.solution) s.solution = s.grid.slice();
    return;
  }
  if (bestN === 0) return;
  const r = ROW_OF[best];
  const c = COL_OF[best];
  const b = BOX_OF[best];
  const bits: number[] = [];
  for (let m = bestMask; m; m &= m - 1) bits.push(m & -m);
  if (s.rand) shuffle(bits, s.rand);
  for (const bit of bits) {
    s.grid[best] = digitOf(bit);
    s.rows[r] |= bit;
    s.cols[c] |= bit;
    s.boxes[b] |= bit;
    search(s);
    s.grid[best] = 0;
    s.rows[r] &= ~bit;
    s.cols[c] &= ~bit;
    s.boxes[b] &= ~bit;
    if (s.count >= s.limit) return;
  }
}

/** Number of solutions, counting no further than `limit` (2 is enough to test uniqueness). */
export function countSolutions(grid: ArrayLike<number>, limit = 2): number {
  const s = prepare(grid, limit, null);
  if (!s) return 0;
  search(s);
  return s.count;
}

/** The first solution found, or null when there is none. */
export function solve(grid: ArrayLike<number>): Grid | null {
  const s = prepare(grid, 1, null);
  if (!s) return null;
  search(s);
  return s.solution ? Array.from(s.solution) : null;
}

/** A random, completely filled valid grid. */
export function randomSolution(rand: Rand = Math.random): Grid {
  // The three diagonal boxes do not constrain each other, so seed them first.
  const seed = new Array<number>(81).fill(0);
  for (const b of [0, 4, 8]) {
    const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rand);
    BOXES[b].forEach((cell, k) => (seed[cell] = digits[k]));
  }
  const s = prepare(seed, 1, rand)!;
  search(s);
  return Array.from(s.solution!);
}

/* ----------------------------------------------------------------- grading */

/** Candidate masks for every empty cell of a grid (0 for filled cells). */
export function candidates(grid: ArrayLike<number>): Uint16Array {
  const cand = new Uint16Array(81);
  for (let i = 0; i < 81; i++) {
    if (grid[i]) continue;
    let used = 0;
    for (const p of PEERS[i]) if (grid[p]) used |= bitOf(grid[p]);
    cand[i] = ALL & ~used;
  }
  return cand;
}

interface Logic {
  values: Uint8Array;
  cand: Uint16Array;
  left: number;
}

function place(s: Logic, i: number, d: number) {
  s.values[i] = d;
  s.cand[i] = 0;
  s.left--;
  const bit = bitOf(d);
  for (const p of PEERS[i]) s.cand[p] &= ~bit;
}

/** Place every naked single. Returns -1 on a contradiction, else how many were placed. */
function nakedSingles(s: Logic): number {
  let placed = 0;
  for (let i = 0; i < 81; i++) {
    if (s.values[i]) continue;
    if (!s.cand[i]) return -1;
    if (POP[s.cand[i]] === 1) {
      place(s, i, digitOf(s.cand[i]));
      placed++;
    }
  }
  return placed;
}

/** Cells of a unit that still allow digit bit. */
function spots(s: Logic, unit: number[], bit: number): number[] {
  const out: number[] = [];
  for (const i of unit) if (s.cand[i] & bit) out.push(i);
  return out;
}

/** Place every hidden single. Returns -1 on a contradiction, else how many were placed. */
function hiddenSingles(s: Logic): number {
  let placed = 0;
  for (const unit of UNITS) {
    for (let d = 1; d <= 9; d++) {
      const bit = bitOf(d);
      if (unit.some((i) => s.values[i] === d)) continue;
      const where = spots(s, unit, bit);
      if (where.length === 0) return -1;
      if (where.length === 1) {
        place(s, where[0], d);
        placed++;
      }
    }
  }
  return placed;
}

/** Remove `bit` from every cell in `cells` except those in `keep`. Returns true when anything changed. */
function eliminate(s: Logic, cells: number[], keep: number[], bit: number): boolean {
  let changed = false;
  for (const i of cells) {
    if (keep.includes(i) || !(s.cand[i] & bit)) continue;
    s.cand[i] &= ~bit;
    changed = true;
  }
  return changed;
}

/**
 * Pointing and claiming: a digit confined to one box-line intersection.
 * Returns after the first elimination so the grader goes back to singles.
 */
function lockedCandidates(s: Logic): boolean {
  for (let b = 0; b < 9; b++) {
    for (let d = 1; d <= 9; d++) {
      const bit = bitOf(d);
      const where = spots(s, BOXES[b], bit);
      if (where.length < 2) continue;
      if (where.every((i) => ROW_OF[i] === ROW_OF[where[0]]) && eliminate(s, ROWS[ROW_OF[where[0]]], where, bit)) return true;
      if (where.every((i) => COL_OF[i] === COL_OF[where[0]]) && eliminate(s, COLS[COL_OF[where[0]]], where, bit)) return true;
    }
  }
  for (const line of [...ROWS, ...COLS]) {
    for (let d = 1; d <= 9; d++) {
      const bit = bitOf(d);
      const where = spots(s, line, bit);
      if (where.length >= 2 && where.every((i) => BOX_OF[i] === BOX_OF[where[0]]) && eliminate(s, BOXES[BOX_OF[where[0]]], where, bit)) return true;
    }
  }
  return false;
}

/** Naked pairs (two cells, same two candidates) and hidden pairs (two digits, same two cells). */
function pairs(s: Logic): boolean {
  for (const unit of UNITS) {
    const open = unit.filter((i) => !s.values[i]);
    for (let a = 0; a < open.length; a++) {
      const mask = s.cand[open[a]];
      if (POP[mask] !== 2) continue;
      for (let b = a + 1; b < open.length; b++) {
        if (s.cand[open[b]] !== mask) continue;
        let changed = false;
        for (let m = mask; m; m &= m - 1) changed = eliminate(s, open, [open[a], open[b]], m & -m) || changed;
        if (changed) return true;
      }
    }
    const where = range9.map((k) => spots(s, open, 1 << k));
    for (let x = 0; x < 9; x++) {
      if (where[x].length !== 2) continue;
      for (let y = x + 1; y < 9; y++) {
        if (where[y].length !== 2 || where[y][0] !== where[x][0] || where[y][1] !== where[x][1]) continue;
        const keep = (1 << x) | (1 << y);
        if (where[x].some((i) => s.cand[i] & ~keep)) {
          for (const i of where[x]) s.cand[i] &= keep;
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Solve like a person would, always reaching for the easiest technique first,
 * and return the hardest level that was needed. Techniques above `maxLevel`
 * are not tried; STUCK (4) means the puzzle could not be finished that way.
 */
export function grade(givens: ArrayLike<number>, maxLevel = 3): number {
  const s: Logic = { values: Uint8Array.from(givens), cand: candidates(givens), left: 0 };
  for (let i = 0; i < 81; i++) if (!s.values[i]) s.left++;
  let level = 1;
  while (s.left > 0) {
    const naked = nakedSingles(s);
    if (naked < 0) return STUCK;
    if (naked > 0) continue;
    if (maxLevel < 2) return STUCK;
    const hidden = hiddenSingles(s);
    if (hidden < 0) return STUCK;
    if (hidden > 0) {
      level = Math.max(level, 2);
      continue;
    }
    if (maxLevel < 3) return STUCK;
    if (lockedCandidates(s) || pairs(s)) {
      level = 3;
      continue;
    }
    return STUCK;
  }
  return level;
}

/* -------------------------------------------------------------- generation */

interface Spec {
  /** Stop removing clues at this count. */
  clues: number;
  /** Every intermediate puzzle must be solvable with techniques up to this level. */
  maxLevel: number;
  /** Levels accepted for the finished puzzle. */
  accept: [number, number];
}

const SPECS: Record<Difficulty, Spec> = {
  easy: { clues: 38, maxLevel: 1, accept: [1, 1] },
  medium: { clues: 31, maxLevel: 2, accept: [2, 2] },
  hard: { clues: 25, maxLevel: STUCK, accept: [3, 3] },
};

/** Symmetric pairs of cells (180 degree rotation); the centre cell pairs with itself. */
const PAIRS: number[][] = range9
  .flatMap((r) => range9.map((c) => r * 9 + c))
  .filter((i) => i <= 40)
  .map((i) => (i === 40 ? [40] : [i, 80 - i]));

/** True when removing clues kept the puzzle within the difficulty's rules. */
function acceptable(grid: Grid, spec: Spec): boolean {
  // A puzzle solvable by logic alone always has a single solution, so the
  // grader doubles as the uniqueness check for easy and medium.
  if (spec.maxLevel < STUCK) return grade(grid, spec.maxLevel) <= spec.maxLevel;
  return countSolutions(grid, 2) === 1;
}

/** One generation attempt. It may miss the difficulty's level; see `generate`. */
export function attempt(difficulty: Difficulty, rand: Rand = Math.random): Puzzle {
  const spec = SPECS[difficulty];
  const solution = randomSolution(rand);
  const grid = solution.slice();
  let clues = 81;
  for (const pair of shuffle(PAIRS.slice(), rand)) {
    if (clues - pair.length < spec.clues) continue;
    for (const i of pair) grid[i] = 0;
    if (acceptable(grid, spec)) clues -= pair.length;
    else for (const i of pair) grid[i] = solution[i];
    if (clues <= spec.clues) break;
  }
  return { difficulty, givens: grid, solution, level: grade(grid, 3), clues };
}

/** Lower is better: how far a puzzle is from what the difficulty asks for. */
function distance(p: Puzzle): number {
  const spec = SPECS[p.difficulty];
  const [lo, hi] = spec.accept;
  const levelOff = p.level < lo ? lo - p.level : p.level > hi ? p.level - hi : 0;
  return levelOff * 100 + Math.abs(p.clues - spec.clues);
}

export const isAccepted = (p: Puzzle) => {
  const [lo, hi] = SPECS[p.difficulty].accept;
  return p.level >= lo && p.level <= hi;
};

export interface GenerateOptions {
  rand?: Rand;
  /** Stop trying for a better puzzle after this long. Default 400 ms. */
  budgetMs?: number;
  /** Give up after this many attempts (mainly for tests). */
  maxAttempts?: number;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function better(a: Puzzle | null, b: Puzzle): Puzzle {
  return !a || distance(b) < distance(a) ? b : a;
}

/** Generate synchronously: attempts until one matches the difficulty or the budget runs out. */
export function generate(difficulty: Difficulty, opts: GenerateOptions = {}): Puzzle {
  const { rand = Math.random, budgetMs = 400, maxAttempts = 200 } = opts;
  const start = now();
  let best: Puzzle | null = null;
  for (let n = 0; n < maxAttempts; n++) {
    best = better(best, attempt(difficulty, rand));
    if (isAccepted(best) || now() - start > budgetMs) break;
  }
  return best!;
}

/**
 * Same as `generate`, but runs one attempt per macrotask so the page stays
 * responsive while a hard puzzle needs several tries.
 */
export function generateAsync(difficulty: Difficulty, opts: GenerateOptions & { signal?: AbortSignal } = {}): Promise<Puzzle> {
  const { rand = Math.random, budgetMs = 400, maxAttempts = 200, signal } = opts;
  const start = now();
  let best: Puzzle | null = null;
  let tries = 0;
  return new Promise((resolve, reject) => {
    const step = () => {
      if (signal?.aborted) return reject(new DOMException('aborted', 'AbortError'));
      best = better(best, attempt(difficulty, rand));
      tries++;
      if (isAccepted(best) || tries >= maxAttempts || now() - start > budgetMs) resolve(best);
      else setTimeout(step, 0);
    };
    setTimeout(step, 0);
  });
}
