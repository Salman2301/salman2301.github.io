import { derived, get } from 'svelte/store';
import { persisted } from './storage';
import { notes } from '../widgets/notes/store';
import { INBOX_ID, projects, removeProject, type Project } from './tasks';
import { isThemeName, themeOverride } from './theme';

/**
 * Spaces group tasks and notes (Inbox is the default space). The status bar
 * picks the active space: "all" shows everything; a space shows only its
 * tasks, notes and reminders, and switches to the space's theme if it has one.
 */

export const ALL = 'all';

export const activeSpace = persisted<string>('spaces:active', ALL);

/** The active space, or null for all spaces. */
export const currentSpace = derived([activeSpace, projects], ([$id, $list]) => ($id === ALL ? null : $list.find((p) => p.id === $id) ?? null));

export function setActiveSpace(id: string) {
  activeSpace.set(id === ALL || get(projects).some((p) => p.id === id) ? id : ALL);
}

/** Where new tasks and notes go: the active space, else the Inbox. */
export function spaceForNew(): string {
  const id = get(activeSpace);
  return id === ALL ? INBOX_ID : id;
}

/** Whether something in `spaceId` is shown under the active space. */
export function visibleIn(active: string, spaceId: string): boolean {
  return active === ALL || active === spaceId;
}

export function spaceName(list: Project[], id: string): string {
  return list.find((p) => p.id === id)?.name ?? 'Inbox';
}

// A deleted space falls back to all; the active space's theme (if any) shows.
currentSpace.subscribe((space) => {
  if (get(activeSpace) !== ALL && !space) activeSpace.set(ALL);
  themeOverride.set(space && isThemeName(space.theme) ? space.theme : null);
});

/** Delete a space: its tasks and notes move to the Inbox. The Inbox stays. */
export function deleteSpace(id: string): boolean {
  if (!removeProject(id)) return false;
  notes.update((list) => list.map((n) => (n.spaceId === id ? { ...n, spaceId: undefined } : n)));
  if (get(activeSpace) === id) activeSpace.set(ALL);
  return true;
}
