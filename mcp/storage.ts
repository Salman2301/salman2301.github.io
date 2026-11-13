import { writable, type Writable } from 'svelte/store';

/**
 * Stands in for src/lib/core/storage.ts when the tools run in Node: the
 * "storage" is the data of the workspace file, held in memory. The server
 * loads the file into it before each tool call (hydrate) and writes it back
 * when the call changed something (dump, changed).
 */

/** key -> JSON text, like localStorage without the prefix. */
let data = new Map<string, string>();
let dirty = false;
let hydrating = false;

interface Entry {
  key: string;
  initial: unknown;
  store: Writable<unknown>;
}
const stores: Entry[] = [];

export function load<T>(key: string, fallback: T): T {
  const raw = data.get(key);
  if (raw === undefined) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  const json = JSON.stringify(value);
  if (data.get(key) === json) return;
  data.set(key, json);
  dirty = true;
}

export function remove(key: string): void {
  if (data.delete(key)) dirty = true;
}

export const storedKeys = (): string[] => [...data.keys()];
export const writeRaw = (key: string, json: string) => void data.set(key, json);
export const removeRaw = (key: string) => void data.delete(key);
export function freezeStorage() {
  /* nothing to freeze here */
}
export function onStorageChange(): () => void {
  return () => undefined;
}

/** A store kept in step with the file's data. Writes go straight to the data, with no delay. */
export function persisted<T>(key: string, initial: T): Writable<T> {
  const store = writable<T>(load<T>(key, initial));
  stores.push({ key, initial, store: store as Writable<unknown> });
  let first = true;
  store.subscribe((value) => {
    if (first) {
      first = false;
      return;
    }
    if (hydrating) return;
    // a store still at its starting value is not written: the file keeps only what was really set
    if (!data.has(key) && JSON.stringify(value) === JSON.stringify(initial)) return;
    save(key, value);
  });
  return store;
}

/** Load the file's data and point every store at it. */
export function hydrate(next: Record<string, unknown>) {
  hydrating = true;
  data = new Map(Object.entries(next).map(([k, v]) => [k, JSON.stringify(v)]));
  for (const s of stores) s.store.set(load(s.key, s.initial));
  hydrating = false;
  dirty = false;
}

/** The data as it is now, keys sorted like the site's own backups. */
export function dump(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of [...data.keys()].sort()) out[key] = JSON.parse(data.get(key)!);
  return out;
}

/** Whether a tool call changed anything since the last hydrate. */
export const changed = () => dirty;
