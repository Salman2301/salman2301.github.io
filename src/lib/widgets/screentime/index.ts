import type { WidgetDef } from '../../core/types';
import ScreenTime from './ScreenTime.svelte';

const widget: WidgetDef = {
  id: 'screentime',
  title: 'Screen Time',
  description: 'How long you use the site: per day, and today by widget, space and hour.',
  icon: '◷',
  component: ScreenTime,
  defaultConfig: { range: 7 },
  keywords: ['screen time', 'usage', 'analytics', 'stats', 'time', 'activity', 'focus'],
};

export default widget;
