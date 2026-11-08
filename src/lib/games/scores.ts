import { get } from 'svelte/store';
import { persisted } from '../core/storage';

/** Best score per game id. */
export const highScores = persisted<Record<string, number>>('games:highscores', {});

/** Total plays per game id. */
export const plays = persisted<Record<string, number>>('games:plays', {});

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
