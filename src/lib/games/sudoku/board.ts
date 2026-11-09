import { BOX_OF, COL_OF, DIFFICULTIES, PEERS, ROW_OF, UNITS, bitOf, candidates, popcount, type Difficulty, type Puzzle } from './generator';

/**
 * Game rules on top of a generated puzzle: entering digits, pencil notes,
 * mistakes, hints, undo, scoring. Every function is pure and returns a new
 * state, so the UI can keep one store and persist it as plain JSON.
 */

export const MAX_MISTAKES = 3;
export const HINT_PENALTY_MS = 30_000;
export const MISTAKE_PENALTY = 50;
export const BASE_POINTS: Record<Difficulty, number> = { easy: 1000, medium: 2000, hard: 3000 };
const MIN_POINTS = 100;
const HISTORY_LIMIT = 300;

/** The state of one cell before a move changed it. */
export interface CellSnap {
  i: number;
  v: number;
  n: number;
}

export type Status = 'playing' | 'solved' | 'lost';

export interface GameState {
  v: 1;
  id: string;
  difficulty: Difficulty;
  givens: number[];
  solution: number[];
  /** Current digits, givens included; 0 for empty. */
  values: number[];
  /** Pencil notes per cell as 9-bit masks. */
  notes: number[];
  /** Cells revealed by hints; they are locked like givens. */
  hinted: number[];
  mistakes: number;
  hints: number;
  /** Play time, including hint penalties. */
  elapsedMs: number;
  /** Undo stack: one entry per move, holding what the move overwrote. */
  history: CellSnap[][];
  status: Status;
}

export type Outcome = 'none' | 'placed' | 'mistake' | 'lost' | 'solved' | 'noted' | 'erased' | 'undone' | 'hinted';

export interface MoveResult {
  state: GameState;
  outcome: Outcome;
  /** The cell the move was about, for selection and effects. */
  cell?: number;
  /** Cells of rows, columns and boxes this move completed. */
  completed?: number[];
}

const none = (state: GameState): MoveResult => ({ state, outcome: 'none' });

export function newGame(p: Puzzle): GameState {
  return {
    v: 1,
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    difficulty: p.difficulty,
    givens: p.givens.slice(),
    solution: p.solution.slice(),
    values: p.givens.slice(),
    notes: new Array(81).fill(0),
    hinted: [],
    mistakes: 0,
    hints: 0,
    elapsedMs: 0,
    history: [],
    status: 'playing',
  };
}

export const isGiven = (s: GameState, i: number) => s.givens[i] !== 0;
export const isLocked = (s: GameState, i: number) => s.givens[i] !== 0 || s.hinted.includes(i);
export const isWrong = (s: GameState, i: number) => s.values[i] !== 0 && s.values[i] !== s.solution[i];
const isSolved = (s: GameState) => s.values.every((v, i) => v === s.solution[i]);

/** True when the player has done anything worth asking before throwing it away. */
export const hasProgress = (s: GameState) =>
  s.status === 'playing' && (s.history.length > 0 || s.hints > 0 || s.elapsedMs > 20_000);

function pushHistory(history: CellSnap[][], snaps: CellSnap[]): CellSnap[][] {
  const next = history.length >= HISTORY_LIMIT ? history.slice(1) : history.slice();
  next.push(snaps);
  return next;
}

/** Cells of the units through `i` that are now completely and correctly filled. */
function completedAround(s: GameState, i: number): number[] {
  const units = [UNITS[ROW_OF[i]], UNITS[9 + COL_OF[i]], UNITS[18 + BOX_OF[i]]];
  const cells = new Set<number>();
  for (const unit of units) if (unit.every((c) => s.values[c] === s.solution[c])) unit.forEach((c) => cells.add(c));
  return [...cells];
}

/** Clear digit `d` from the notes of every peer of `i`, recording what changed. */
function clearPeerNotes(notes: number[], values: number[], i: number, d: number, snaps?: CellSnap[]) {
  const bit = bitOf(d);
  for (const p of PEERS[i]) {
    if (!(notes[p] & bit)) continue;
    snaps?.push({ i: p, v: values[p], n: notes[p] });
    notes[p] &= ~bit;
  }
}

const ALL_CELLS = Array.from({ length: 81 }, (_, i) => i);

/** Write digit `d` into cell `i`. A digit that does not match the solution is a mistake. */
export function enter(s: GameState, i: number, d: number): MoveResult {
  if (s.status !== 'playing' || isLocked(s, i) || s.values[i] === d || d < 1 || d > 9) return none(s);
  const snaps: CellSnap[] = [{ i, v: s.values[i], n: s.notes[i] }];
  const values = s.values.slice();
  const notes = s.notes.slice();
  values[i] = d;
  notes[i] = 0;
  const correct = d === s.solution[i];
  if (correct) clearPeerNotes(notes, values, i, d, snaps);
  const next: GameState = { ...s, values, notes, history: pushHistory(s.history, snaps) };
  if (!correct) {
    next.mistakes = s.mistakes + 1;
    if (next.mistakes >= MAX_MISTAKES) next.status = 'lost';
    return { state: next, outcome: next.status === 'lost' ? 'lost' : 'mistake', cell: i };
  }
  if (isSolved(next)) return { state: { ...next, status: 'solved' }, outcome: 'solved', cell: i, completed: ALL_CELLS };
  return { state: next, outcome: 'placed', cell: i, completed: completedAround(next, i) };
}

/** Toggle pencil note `d` in an empty cell. */
export function toggleNote(s: GameState, i: number, d: number): MoveResult {
  if (s.status !== 'playing' || isLocked(s, i) || s.values[i] !== 0 || d < 1 || d > 9) return none(s);
  const notes = s.notes.slice();
  notes[i] ^= bitOf(d);
  return { state: { ...s, notes, history: pushHistory(s.history, [{ i, v: 0, n: s.notes[i] }]) }, outcome: 'noted', cell: i };
}

/** Clear the digit and notes of a cell the player filled. */
export function erase(s: GameState, i: number): MoveResult {
  if (s.status !== 'playing' || isLocked(s, i) || (s.values[i] === 0 && s.notes[i] === 0)) return none(s);
  const values = s.values.slice();
  const notes = s.notes.slice();
  values[i] = 0;
  notes[i] = 0;
  const history = pushHistory(s.history, [{ i, v: s.values[i], n: s.notes[i] }]);
  return { state: { ...s, values, notes, history }, outcome: 'erased', cell: i };
}

/** Revert the last move. Mistakes stay counted; cells locked by a hint since then stay as they are. */
export function undo(s: GameState): MoveResult {
  if (s.status !== 'playing' || !s.history.length) return none(s);
  const history = s.history.slice();
  const snaps = history.pop()!;
  const values = s.values.slice();
  const notes = s.notes.slice();
  for (const snap of snaps) {
    if (isLocked(s, snap.i)) continue;
    values[snap.i] = snap.v;
    notes[snap.i] = snap.n;
  }
  return { state: { ...s, values, notes, history }, outcome: 'undone', cell: snaps[0].i };
}

/**
 * The cell a hint should reveal: the selected one when it is empty or wrong,
 * otherwise the open cell with the fewest candidates (the easiest next step).
 */
export function hintTarget(s: GameState, preferred: number): number {
  const open = (i: number) => !isLocked(s, i) && s.values[i] !== s.solution[i];
  if (preferred >= 0 && preferred < 81 && open(preferred)) return preferred;
  const known = s.values.map((v, i) => (v === s.solution[i] ? v : 0));
  const cand = candidates(known);
  let best = -1;
  let bestN = 10;
  for (let i = 0; i < 81; i++) {
    if (!open(i)) continue;
    const n = popcount(cand[i]);
    if (n < bestN) {
      best = i;
      bestN = n;
    }
  }
  return best;
}

/** Reveal one correct cell. It costs HINT_PENALTY_MS of play time and cannot be undone. */
export function hint(s: GameState, preferred = -1): MoveResult {
  if (s.status !== 'playing') return none(s);
  const i = hintTarget(s, preferred);
  if (i < 0) return none(s);
  const values = s.values.slice();
  const notes = s.notes.slice();
  values[i] = s.solution[i];
  notes[i] = 0;
  clearPeerNotes(notes, values, i, values[i]);
  const next: GameState = {
    ...s,
    values,
    notes,
    hinted: [...s.hinted, i],
    hints: s.hints + 1,
    elapsedMs: s.elapsedMs + HINT_PENALTY_MS,
  };
  if (isSolved(next)) return { state: { ...next, status: 'solved' }, outcome: 'solved', cell: i, completed: ALL_CELLS };
  return { state: next, outcome: 'hinted', cell: i, completed: completedAround(next, i) };
}

/** For every cell, whether its digit repeats in its row, column or box. */
export function conflicts(values: number[]): boolean[] {
  const out = new Array<boolean>(81).fill(false);
  for (const unit of UNITS) {
    const seen = new Map<number, number>();
    for (const i of unit) {
      const d = values[i];
      if (!d) continue;
      const first = seen.get(d);
      if (first === undefined) seen.set(d, i);
      else out[first] = out[i] = true;
    }
  }
  return out;
}

/** How many of each digit (index 1-9) still need placing correctly. */
export function remaining(s: GameState): number[] {
  const left = new Array<number>(10).fill(9);
  left[0] = 0;
  s.values.forEach((v, i) => {
    if (v && v === s.solution[i]) left[v]--;
  });
  return left;
}

/** Points for finishing now: more for harder puzzles, fewer for time (hints add time) and mistakes. */
export function points(s: GameState): number {
  const seconds = Math.floor(s.elapsedMs / 1000);
  return Math.max(MIN_POINTS, BASE_POINTS[s.difficulty] - seconds - s.mistakes * MISTAKE_PENALTY);
}

/** 75_000 -> "01:15", 3_725_000 -> "1:02:05". */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor(total / 60) % 60;
  const sec = total % 60;
  const mmss = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return h ? `${h}:${mmss}` : mmss;
}

const isDigits = (x: unknown, max: number): x is number[] =>
  Array.isArray(x) && x.length === 81 && x.every((n) => Number.isInteger(n) && n >= 0 && n <= max);

/** Validate a saved game read back from storage. */
export function isGameState(x: unknown): x is GameState {
  const s = x as GameState;
  return (
    !!s &&
    s.v === 1 &&
    typeof s.id === 'string' &&
    DIFFICULTIES.includes(s.difficulty) &&
    isDigits(s.givens, 9) &&
    isDigits(s.solution, 9) &&
    isDigits(s.values, 9) &&
    isDigits(s.notes, 0x1ff) &&
    Array.isArray(s.hinted) &&
    Array.isArray(s.history) &&
    typeof s.mistakes === 'number' &&
    typeof s.hints === 'number' &&
    typeof s.elapsedMs === 'number' &&
    (s.status === 'playing' || s.status === 'solved' || s.status === 'lost')
  );
}
