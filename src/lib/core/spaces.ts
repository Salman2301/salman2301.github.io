import { derived, get } from 'svelte/store';
import { notes } from '../widgets/notes/store';
import { load, remove } from './storage';
import { INBOX_ID, projects, removeProject, type Project } from './tasks';
import { isThemeName, themeOverride } from './theme';
import { setTabSpace, workspace } from './workspace';

/**
 * Spaces group tasks and notes (Inbox is the default space). Each tab is
 * pinned to a space from the status bar: "all" shows everything; a space
 * shows only its tasks, notes and reminders, in the space's theme if it has
 * one. Switching tabs switches to that tab's space.
 */

export const ALL = 'all';

const tabSpace = derived(workspace, (s) => s.tabs.find((t) => t.id === s.active)?.space ?? ALL);

/** The current tab's space ('all' for every space). Setting it pins the current tab. */
export const activeSpace = {
  subscribe: tabSpace.subscribe,
  set: (id: string) => setTabSpace(get(workspace).active, id),
};

// Before spaces were per tab there was one global choice: give it to the current tab.
{
  const legacy = load<string>('spaces:active', ALL);
  if (legacy !== ALL && get(tabSpace) === ALL) activeSpace.set(legacy);
  remove('spaces:active');
}

/** The current tab's space, or null for all spaces. */
export const currentSpace = derived([tabSpace, projects], ([$id, $list]) => ($id === ALL ? null : $list.find((p) => p.id === $id) ?? null));

export function setActiveSpace(id: string) {
  activeSpace.set(id === ALL || get(projects).some((p) => p.id === id) ? id : ALL);
}

/** Where new tasks and notes go: the current tab's space, else the Inbox. */
export function spaceForNew(): string {
  const id = get(tabSpace);
  return id === ALL ? INBOX_ID : id;
}

/** Whether something in `spaceId` is shown under the active space. */
export function visibleIn(active: string, spaceId: string): boolean {
  return active === ALL || active === spaceId;
}

export function spaceName(list: Project[], id: string): string {
  return list.find((p) => p.id === id)?.name ?? 'Inbox';
}

// A tab pinned to a deleted space goes back to all; the space's theme (if any) shows.
currentSpace.subscribe((space) => {
  if (get(tabSpace) !== ALL && !space) activeSpace.set(ALL);
  themeOverride.set(space && isThemeName(space.theme) ? space.theme : null);
});

/** Delete a space: its tasks and notes move to the Inbox, and tabs pinned to it show all. The Inbox stays. */
export function deleteSpace(id: string): boolean {
  if (!removeProject(id)) return false;
  notes.update((list) => list.map((n) => (n.spaceId === id ? { ...n, spaceId: undefined } : n)));
  for (const t of get(workspace).tabs) if (t.space === id) setTabSpace(t.id, ALL);
  return true;
}
