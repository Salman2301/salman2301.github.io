import { writable } from 'svelte/store';

/** Global UI toggles shared by the shell and overlays. */
export const templatePickerOpen = writable(false);

/**
 * Generic event bus for overlays opened by commands, e.g. the command palette
 * or a screensaver: `openOverlay.set('palette')`. Overlays subscribe and
 * reset it to null once handled.
 */
export const openOverlay = writable<string | null>(null);
