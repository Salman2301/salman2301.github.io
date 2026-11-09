/**
 * Fit the board and number pad into the space the game gets. The pad goes
 * beside the board in wide areas and under it in tall or narrow ones,
 * whichever leaves the bigger board. Small areas drop the top bar and then
 * the action buttons, so the board and the digits always fit.
 */

export interface Layout {
  mode: 'side' | 'bottom';
  /** Exact board edge in px (a whole number of px per cell, so lines stay crisp). */
  board: number;
  cell: number;
  keyW: number;
  keyH: number;
  actionH: number;
  /** Space between keys, and between the board, bar and pad. */
  keyGap: number;
  gap: number;
  /** Padding around everything. */
  inset: number;
  bar: boolean;
  barH: number;
  actions: boolean;
}

/** Board frame: 2px outer edge, two 2px box lines and six 1px cell lines per side. */
export const LINES = 2 * 2 + 2 * 2 + 6;

export function fitBoard(size: number): { board: number; cell: number } {
  const cell = Math.max(4, Math.floor((size - LINES) / 9));
  return { cell, board: cell * 9 + LINES };
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function computeLayout(w: number, h: number, touch: boolean): Layout {
  const tiny = w < 260 || h < 190;
  const small = w < 380 || h < 320;
  const inset = tiny ? 4 : small ? 6 : 10;
  const gap = tiny ? 4 : small ? 6 : 10;
  const keyGap = tiny ? 3 : touch ? 6 : 5;
  const bar = !tiny;
  const barH = touch ? 36 : 28;
  const actionH = touch ? 38 : small ? 26 : 30;
  const minKey = touch ? 34 : tiny ? 18 : 24;
  const aw = Math.max(0, w - 2 * inset);
  const ah = Math.max(0, h - 2 * inset - (bar ? barH + gap : 0));
  const base = { actionH, keyGap, gap, inset, bar, barH };

  // Side panel: a 3x3 grid of square digit keys with the actions under it.
  const side = (() => {
    let size = Math.min(ah, aw * 0.7);
    let key = minKey;
    for (let k = 0; k < 4; k++) {
      key = clamp(Math.floor(size / 5.2), minKey, 60);
      key = Math.min(key, Math.floor((ah - 2 * keyGap) / 3));
      size = Math.min(ah, aw - gap - (3 * key + 2 * keyGap));
    }
    const digitsH = 3 * key + 2 * keyGap;
    const actions = digitsH + gap + 2 * actionH + keyGap <= Math.max(size, ah);
    return { mode: 'side' as const, ...fitBoard(size), keyW: key, keyH: key, actions };
  })();

  // Bottom pad: one row of nine digit keys as wide as the board, actions under it.
  const bottom = (() => {
    const fit = (withActions: boolean) => {
      let size = Math.min(aw, ah * 0.75);
      let keyW = 0;
      let keyH = 0;
      for (let k = 0; k < 4; k++) {
        keyW = Math.floor((size - 8 * keyGap) / 9);
        keyH = clamp(Math.round(keyW * 1.1), touch ? 40 : tiny ? 20 : 26, 50);
        size = Math.min(aw, ah - gap - keyH - (withActions ? keyGap + actionH : 0));
      }
      return { mode: 'bottom' as const, ...fitBoard(size), keyW, keyH, actions: withActions };
    };
    const full = fit(true);
    return full.board >= 150 ? full : fit(false);
  })();

  const pick = bottom.board > side.board ? bottom : side;
  return { ...base, ...pick };
}
