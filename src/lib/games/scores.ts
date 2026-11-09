import { get } from 'svelte/store';
import { persisted } from '../core/storage';

/**
 * Best score per game id. High scores only ever go up: nothing in the app
 * lowers or clears them (reset --all keeps them, and restoring a backup or a
 * synced file keeps the better of the two).
 */
export const HIGH_SCORES_KEY = 'games:highscores';
export const highScores = persisted<Record<string, number>>(HIGH_SCORES_KEY, {}, 0);

/** Total plays per game id. */
export const plays = persisted<Record<string, number>>('games:plays', {}, 0);

export function bestFor(id: string): number {
  return get(highScores)[id] ?? 0;
}

/** Record a finished run. Returns true when it is a new best. */
export function recordScore(id: string, score: number, lowerIsBetter = false): boolean {
  plays.update((p) => ({ ...p, [id]: (p[id] ?? 0) + 1 }));
  if (!(score > 0)) return false;
  const prev = get(highScores)[id];
  const better = !prev || (lowerIsBetter ? score < prev : score > prev);
  if (better) {
    highScores.update((h) => ({ ...h, [id]: score }));
    return true;
  }
  return false;
}

/** The better of two score tables, game by game (higher wins). */
export function mergeBest(a: Record<string, number> = {}, b: Record<string, number> = {}): Record<string, number> {
  const out: Record<string, number> = { ...a };
  for (const [id, n] of Object.entries(b)) if (typeof n === 'number' && !(n <= (out[id] ?? 0))) out[id] = n;
  return out;
}
