import type { Tone } from '../../../core/types';

/**
 * Terminal output that keeps changing after it is printed (spinners,
 * progress bars, the hex dump of `hack`). The command owns a store and
 * updates it; the rendered component only displays it. Because the state
 * lives in the store, a terminal that remounts (split, move) shows the
 * current frame instead of restarting, and Ctrl+C freezes it in place.
 */
export interface LiveState {
  text: string;
  tone: Tone;
  /** 0..1 shows a progress bar after the text. */
  progress?: number;
  /** Interrupted (Ctrl+C): drawn dimmed. */
  stopped?: boolean;
}

export interface DecryptState {
  /** First line of the dump; bumping it scrolls the dump up. */
  line: number;
  /** Bumps every frame so the undecrypted bytes flicker. */
  frame: number;
  /** 0..1, share of bytes already decrypted into the secret. */
  reveal: number;
  stopped: boolean;
}

/** Svelte action: report the element's content width whenever it changes. */
export function measureWidth(node: HTMLElement, onWidth: (width: number, fontPx: number) => void) {
  const report = () => onWidth(node.clientWidth, parseFloat(getComputedStyle(node).fontSize) || 14);
  const observer = new ResizeObserver(report);
  observer.observe(node);
  report();
  return {
    update(next: (width: number, fontPx: number) => void) {
      onWidth = next;
    },
    destroy: () => observer.disconnect(),
  };
}
