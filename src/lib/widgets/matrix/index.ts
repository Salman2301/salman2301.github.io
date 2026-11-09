import type { WidgetDef } from '../../core/types';
import Matrix from './Matrix.svelte';
import { CHARSETS, DEFAULT_SETTINGS, readSettings } from './settings';

const widget: WidgetDef = {
  id: 'matrix',
  title: 'Digital Rain',
  description: 'Falling glyphs in your theme colours. Click or space to pause.',
  icon: '⁞⁞',
  component: Matrix,
  defaultConfig: { ...DEFAULT_SETTINGS },
  keywords: ['matrix', 'rain', 'screensaver', 'ambient', 'hacker', 'code', 'katakana'],
  paneTitle: (config) => {
    const { charset } = readSettings(config);
    return charset === DEFAULT_SETTINGS.charset ? 'Digital Rain' : `Digital Rain · ${CHARSETS[charset].label}`;
  },
};

export default widget;
