import type { WidgetDef } from '../../core/types';
import Clock from './Clock.svelte';

const widget: WidgetDef = {
  id: 'clock',
  title: 'Clock',
  description: 'A clock with 22 faces (digital, analog dials, flip, binary, words and more) and world time zones.',
  icon: '◴',
  component: Clock,
  defaultConfig: { face: 'digital', zones: [] },
  keywords: ['time', 'date', 'world', 'timezone', 'analog', 'zones', 'watch', 'face', 'faces', 'flip', 'binary'],
  paneTitle: (config) => {
    const n = Array.isArray(config.zones) ? config.zones.length : 0;
    return n ? `Clock · ${n} zone${n === 1 ? '' : 's'}` : 'Clock';
  },
};

export default widget;
