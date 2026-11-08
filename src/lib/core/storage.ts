import { writable, type Writable } from 'svelte/store';

/**
 * Safe localStorage helpers. Every key is namespaced with PREFIX so the app
 * never collides with anything else on the origin. All reads and writes are
 * wrapped in try/catch because storage can be unavailable (private mode,
 * blocked site data, quota exceeded).
 */
const PREFIX = 's2301:';

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable or full: ignore */
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

/**
 * A svelte writable store that is persisted to localStorage under `key`.
 * Writes are debounced so fast-changing values (timers, editors) do not
 * hammer storage.
 */
export function persisted<T>(key: string, initial: T, debounceMs = 150): Writable<T> {
  const store = writable<T>(load<T>(key, initial));
  let timer: ReturnType<typeof setTimeout> | undefined;
  store.subscribe((value) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => save(key, value), debounceMs);
  });
  return store;
}
