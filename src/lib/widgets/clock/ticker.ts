import { readable } from 'svelte/store';

/**
 * The current time, set just after every second boundary. Each tick
 * schedules the next one from the real clock, so it never drifts the way a
 * setInterval does. It stops while the document is hidden, and only runs
 * while something is subscribed.
 */
export const secondTick = readable(new Date(), (set) => {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = () => {
    // a few ms past the boundary so the new Date() lands in the new second
    timer = setTimeout(() => {
      set(new Date());
      schedule();
    }, 1000 - (Date.now() % 1000) + 4);
  };
  const stop = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };
  const onVisibility = () => {
    stop();
    if (document.hidden) return;
    set(new Date());
    schedule();
  };

  set(new Date());
  schedule();
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    stop();
    document.removeEventListener('visibilitychange', onVisibility);
  };
});
