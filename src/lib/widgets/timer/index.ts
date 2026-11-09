import type { WidgetDef } from '../../core/types';
import Timer from './Timer.svelte';
// the engine keeps time (and rings) even when no timer pane is open
import './engine';

const widget: WidgetDef = {
  id: 'timer',
  title: 'Timer',
  description: 'Stopwatch with laps, and a countdown that rings even in the background.',
  icon: '⧖',
  component: Timer,
  defaultConfig: { mode: 'stopwatch' },
  keywords: ['stopwatch', 'countdown', 'lap', 'alarm', 'kitchen', 'time'],
  paneTitle: (config) => (config.mode === 'countdown' ? 'Timer · countdown' : 'Timer · stopwatch'),
};

export default widget;
