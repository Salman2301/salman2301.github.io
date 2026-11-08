import { derived, writable } from 'svelte/store';

/**
 * Status bar items. Any feature can publish a short live status that shows in
 * the bottom bar (tmux style), e.g. the pomodoro countdown or the track
 * currently playing. Call setStatus(id, null) to remove it, typically in
 * onDestroy.
 */
export interface StatusItem {
  text: string;
  /** Lower comes first. Default 50. */
  order?: number;
  tone?: 'normal' | 'accent' | 'muted';
  /** Optional click action, e.g. focus the pane that owns the status. */
  onClick?: () => void;
  /** Tooltip. */
  title?: string;
}

const items = writable<Record<string, StatusItem>>({});

export function setStatus(id: string, item: StatusItem | null) {
  items.update((all) => {
    const next = { ...all };
    if (item) next[id] = item;
    else delete next[id];
    return next;
  });
}

export const statusItems = derived(items, (all) =>
  Object.entries(all)
    .map(([id, item]) => ({ id, ...item }))
    .sort((a, b) => (a.order ?? 50) - (b.order ?? 50)),
);
