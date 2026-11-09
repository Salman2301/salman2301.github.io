import type { OverlayDef } from '../../core/types';
import Keys from './Keys.svelte';

/** The keyboard shortcut sheet: Alt+/ or the `keys` command. */
const overlay: OverlayDef = { id: 'keys', component: Keys, order: 50 };

export default overlay;
