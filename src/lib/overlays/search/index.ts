import type { OverlayDef } from '../../core/types';
import Search from './Search.svelte';

/** Global search: ⌘K / Ctrl+K, Alt+K, or the `search` command. */
const overlay: OverlayDef = { id: 'search', component: Search, order: 55 };

export default overlay;
