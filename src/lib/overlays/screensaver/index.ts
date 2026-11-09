import type { OverlayDef } from '../../core/types';
import Screensaver from './Screensaver.svelte';

/** Full-screen, theme-coloured screensavers (screensaver command, Alt+S, idle, hack). */
const overlay: OverlayDef = { id: 'screensaver', component: Screensaver, order: 100 };

export default overlay;
