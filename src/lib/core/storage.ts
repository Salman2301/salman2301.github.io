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

/** Set while a backup is being restored: late writes from open stores must not undo it. */
let frozen = false;
const listeners = new Set<(key: string) => void>();

/** Stop all writes until the page reloads (used right before restoring a backup). */
export function freezeStorage() {
  frozen = true;
}

/** Called with the key whenever a stored value really changes. Returns an unsubscribe. */
export function onStorageChange(fn: (key: string) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function save(key: string, value: unknown): void {
  if (frozen) return;
  try {
    const json = JSON.stringify(value);
    if (localStorage.getItem(PREFIX + key) === json) return;
    localStorage.setItem(PREFIX + key, json);
  } catch {
    /* storage unavailable or full: ignore */
    return;
  }
  listeners.forEach((fn) => fn(key));
}

export function remove(key: string): void {
  if (frozen) return;
  try {
    if (localStorage.getItem(PREFIX + key) === null) return;
    localStorage.removeItem(PREFIX + key);
  } catch {
    return;
  }
  listeners.forEach((fn) => fn(key));
}

/** Every stored key, without the prefix. */
export function storedKeys(): string[] {
  try {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .map((k) => k.slice(PREFIX.length));
  } catch {
    return [];
  }
}

/** Write a raw JSON string, even while frozen (restoring a backup), without telling listeners. */
export function writeRaw(key: string, json: string): void {
  try {
    localStorage.setItem(PREFIX + key, json);
  } catch {
    /* ignore */
  }
}

/** Remove a key even while frozen, without telling listeners. */
export function removeRaw(key: string): void {
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
