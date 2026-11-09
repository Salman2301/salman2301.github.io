import { get, type Writable } from 'svelte/store';
import { persisted } from '../../core/storage';
import { findPreset, itemKey, type MediaItem, type Preset } from './media';

/**
 * "Recently played", one persisted list per media widget, newest first.
 * Global rather than per pane: every YouTube pane shares one history.
 */
export const RECENT_LIMIT = 8;

export interface RecentList extends Pick<Writable<MediaItem[]>, 'subscribe'> {
  remember(item: MediaItem): void;
  forget(item: MediaItem): void;
  /** Fill in a title that arrived later (oEmbed). */
  retitle(item: MediaItem, title: string): void;
  clear(): void;
}

const lists = new Map<string, RecentList>();

export function recentFor(widget: string): RecentList {
  const existing = lists.get(widget);
  if (existing) return existing;
  const store = persisted<MediaItem[]>(`media:recent:${widget}`, []);
  const same = (a: MediaItem, b: MediaItem) => itemKey(a) === itemKey(b);
  const list: RecentList = {
    subscribe: store.subscribe,
    remember: (item) =>
      store.update((all) => {
        const prev = all.find((x) => same(x, item));
        const entry: MediaItem = { ...item, title: item.title || prev?.title };
        if (!entry.title) delete entry.title;
        return [entry, ...all.filter((x) => !same(x, item))].slice(0, RECENT_LIMIT);
      }),
    forget: (item) => store.update((all) => all.filter((x) => !same(x, item))),
    retitle: (item, title) => store.update((all) => all.map((x) => (same(x, item) && !x.title ? { ...x, title } : x))),
    clear: () => store.set([]),
  };
  lists.set(widget, list);
  return list;
}

/**
 * Record that `item` was picked: give it a title we already know (a preset
 * name or an earlier oEmbed title) and move it to the top of the recent list.
 */
export function recordPlay(widget: string, presets: Preset[], item: MediaItem): MediaItem {
  const list = recentFor(widget);
  const known = findPreset(presets, item)?.name ?? get(list).find((r) => itemKey(r) === itemKey(item))?.title;
  const chosen: MediaItem = { ...item, title: item.title || known };
  if (!chosen.title) delete chosen.title;
  list.remember(chosen);
  return chosen;
}
