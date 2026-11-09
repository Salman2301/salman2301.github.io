import { get, writable } from 'svelte/store';
import { persisted, save } from '../../core/storage';
import { isGameState, newGame, type GameState } from './board';
import { DIFFICULTIES, generateAsync, type Difficulty } from './generator';

/**
 * Sudoku state shared by every pane that shows the game: the difficulty last
 * picked, the puzzle in progress (so a reload or a trip to another game
 * resumes it) and the best solve time per difficulty.
 */

const GAME_KEY = 'sudoku:game';

export const difficulty = persisted<Difficulty>('sudoku:difficulty', 'easy');
export const game = persisted<GameState | null>(GAME_KEY, null);
export const bestTimes = persisted<Partial<Record<Difficulty, number>>>('sudoku:best', {});
/** True while a new puzzle is being generated. */
export const generating = writable(false);

// Storage can hold anything (older versions, hand edits): drop what does not validate.
if (get(game) !== null && !isGameState(get(game))) game.set(null);
if (!DIFFICULTIES.includes(get(difficulty))) difficulty.set('easy');

let request = 0;

/** Generate a fresh puzzle and make it the game in progress. The latest request wins. */
export async function newPuzzle(level: Difficulty): Promise<void> {
  const mine = ++request;
  difficulty.set(level);
  generating.set(true);
  try {
    const puzzle = await generateAsync(level, { budgetMs: 300 });
    if (mine === request) game.set(newGame(puzzle));
  } finally {
    if (mine === request) generating.set(false);
  }
}

/** Write the game to storage now instead of after the store's debounce (page about to unload). */
export function saveNow() {
  save(GAME_KEY, get(game));
}

/** Record a solve time; returns true when it is the best for that difficulty. */
export function recordTime(level: Difficulty, ms: number): boolean {
  const prev = get(bestTimes)[level];
  if (prev !== undefined && prev <= ms) return false;
  bestTimes.update((b) => ({ ...b, [level]: ms }));
  return true;
}
