import { get, writable } from 'svelte/store';
import { persisted } from './storage';
import { workspace } from './workspace';

/**
 * Screensavers: animations in the theme's colours that fill one pane (the
 * pane that asked, or the focused one). Start one with the `screensaver`
 * command or Alt+S, or let one start after a few idle minutes (off by
 * default). Any key, click or touch returns.
 */

export const SAVERS = [
  { id: 'matrix', title: 'digital rain' },
  { id: 'stars', title: 'warp starfield' },
  { id: 'pipes', title: 'growing pipes' },
  { id: 'bounce', title: 'bouncing logo' },
] as const;

export type SaverId = (typeof SAVERS)[number]['id'];
export const isSaverId = (v: unknown): v is SaverId => SAVERS.some((s) => s.id === v);

export interface SaverRequest {
  id: SaverId;
  /** Lines typed out over the animation (the `hack` command). */
  message?: string[];
  /** The pane it fills. */
  paneId: string | null;
}

/** Set to show a screensaver; the overlay resets it to null. */
export const screensaverRequest = writable<SaverRequest | null>(null);

/** The saver Alt+S and idle use, and the idle delay in minutes (0 = never). */
export const saverPrefs = persisted<{ id: SaverId; idleMinutes: number }>('screensaver', { id: 'matrix', idleMinutes: 0 });

/** Start a screensaver in `paneId` (default: the focused pane). */
export function startScreensaver(id?: SaverId | 'random', message?: string[], paneId?: string) {
  let pick: SaverId = id && id !== 'random' ? id : get(saverPrefs).id;
  if (id === 'random') pick = SAVERS[Math.floor(Math.random() * SAVERS.length)].id;
  screensaverRequest.set({ id: pick, message, paneId: paneId ?? get(workspace).focused });
}
