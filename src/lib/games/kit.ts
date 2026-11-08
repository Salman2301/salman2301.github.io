import { themeStore } from '../core/theme';
import type { GameApi } from '../core/types';

/** Shared helpers for canvas games: fixed-step loop, HiDPI fitting, held keys, theme colours. */

export interface Palette {
  bg1: string;
  bg2: string;
  hl1: string;
  t1: string;
  t2: string;
}

export function readPalette(el: Element): Palette {
  const s = getComputedStyle(el);
  const g = (n: string, f: string) => s.getPropertyValue(n).trim() || f;
  return { bg1: g('--bg1', '#000'), bg2: g('--bg2', '#333'), hl1: g('--hl1', '#ef4444'), t1: g('--t1', '#aaa'), t2: g('--t2', '#fff') };
}

/** Calls cb with the current palette now and whenever the theme changes. */
export function watchPalette(el: Element, cb: (p: Palette) => void): () => void {
  return themeStore.subscribe(() => requestAnimationFrame(() => cb(readPalette(el))));
}

/**
 * Fixed-timestep loop (deterministic at any refresh rate). While paused it
 * keeps drawing but does not advance, and the clock resets so nothing jumps
 * after resuming.
 */
export function startLoop(update: (dt: number) => void, draw: () => void, isPaused: () => boolean, hz = 60): () => void {
  const step = 1000 / hz;
  let raf = 0;
  let last = 0;
  let acc = 0;
  const frame = (t: number) => {
    raf = requestAnimationFrame(frame);
    if (isPaused()) {
      last = 0;
      acc = 0;
    } else {
      if (!last) last = t;
      acc += Math.min(250, t - last);
      last = t;
      while (acc >= step) {
        update(step / 1000);
        acc -= step;
      }
    }
    draw();
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

/**
 * Size a canvas to the largest box with the virtual aspect ratio that fits
 * the container, with a HiDPI backing store. Returns the context already
 * scaled so the game draws in virtual units.
 */
export function fitCanvas(canvas: HTMLCanvasElement, boxW: number, boxH: number, vw: number, vh: number) {
  const scale = Math.max(0.1, Math.min(boxW / vw, boxH / vh));
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${Math.floor(vw * scale)}px`;
  canvas.style.height = `${Math.floor(vh * scale)}px`;
  canvas.width = Math.floor(vw * scale * dpr);
  canvas.height = Math.floor(vh * scale * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

const ALIASES: Record<string, string> = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

/** Map a key event to up/down/left/right (WASD or arrows), else the event code. */
export function keyName(e: KeyboardEvent): string {
  return ALIASES[e.code] ?? e.code;
}

/** Track held keys (normalised with keyName). Call clear() when pausing. */
export function heldKeys(api: GameApi, onPress?: (name: string, e: KeyboardEvent) => void) {
  const down = new Set<string>();
  const offDown = api.onKeyDown((e) => {
    const k = keyName(e);
    if (!down.has(k) && onPress) onPress(k, e);
    down.add(k);
    if (k === 'up' || k === 'down' || k === 'left' || k === 'right') e.preventDefault();
  });
  const offUp = api.onKeyUp((e) => down.delete(keyName(e)));
  return {
    down,
    has: (k: string) => down.has(k),
    clear: () => down.clear(),
    stop: () => {
      offDown();
      offUp();
    },
  };
}

/** Draw a pixel sprite given as rows of characters ('#' = filled). */
export function drawSprite(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number, color: string, px = 1) {
  ctx.fillStyle = color;
  for (let r = 0; r < rows.length; r++)
    for (let c = 0; c < rows[r].length; c++) if (rows[r][c] === '#') ctx.fillRect(x + c * px, y + r * px, px, px);
}

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
