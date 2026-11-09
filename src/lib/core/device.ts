import { readable } from 'svelte/store';

/**
 * Phone layout and touch helpers.
 *
 * On a narrow screen (the same 720px the stylesheets use) the workspace shows
 * one pane at a time and you swipe between them; see ui/MobilePanes.svelte.
 */

const MOBILE_QUERY = '(max-width: 720px)';

function query(q: string): MediaQueryList | null {
  try {
    return typeof matchMedia === 'function' ? matchMedia(q) : null;
  } catch {
    return null;
  }
}

/** True while the screen is phone-sized. */
export const isMobile = readable(query(MOBILE_QUERY)?.matches ?? false, (set) => {
  const mq = query(MOBILE_QUERY);
  if (!mq) return;
  const on = () => set(mq.matches);
  on();
  mq.addEventListener('change', on);
  return () => mq.removeEventListener('change', on);
});

/**
 * A touch-first device (no mouse, on-screen keyboard). Text fields are not
 * focused automatically there, because that pops the keyboard open.
 */
export function isTouch(): boolean {
  return query('(pointer: coarse)')?.matches ?? false;
}

let started = false;

/**
 * Keep the app as tall as the part of the screen you can see. When the
 * on-screen keyboard opens, the visible area shrinks: --vvh follows it, so
 * the layout (and a terminal prompt at the bottom of a pane) stays above the
 * keyboard instead of hiding behind it.
 */
export function startViewport() {
  if (started || typeof window === 'undefined' || !window.visualViewport) return;
  started = true;
  const vv = window.visualViewport;
  const apply = () => {
    document.documentElement.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    if (!query(MOBILE_QUERY)?.matches) return;
    // iOS pans the page up to show a focused field: the layout already fits, so undo the pan.
    if (window.scrollY || vv.offsetTop) window.scrollTo(0, 0);
    const el = document.activeElement as HTMLElement | null;
    if (el?.matches?.('input, textarea, [contenteditable="true"], .cm-content')) el.scrollIntoView({ block: 'nearest' });
  };
  apply();
  vv.addEventListener('resize', apply);
  vv.addEventListener('scroll', apply);

  // While you type on a touch screen, <html class="typing"> lets the phone
  // layout hide its bars, so the pane gets the room the keyboard left.
  if (!isTouch()) return;
  const TEXT = 'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]), textarea, [contenteditable="true"], .cm-content';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const update = () => {
    if (timer) clearTimeout(timer);
    // after the focus has settled (moving between two fields is not "stopped typing")
    timer = setTimeout(() => {
      const el = document.activeElement as HTMLElement | null;
      document.documentElement.classList.toggle('typing', !!el?.matches?.(TEXT));
    }, 60);
  };
  document.addEventListener('focusin', update);
  document.addEventListener('focusout', update);
}
