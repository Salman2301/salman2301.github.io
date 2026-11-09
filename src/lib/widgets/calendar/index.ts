import type { WidgetDef } from '../../core/types';
import Calendar from './Calendar.svelte';

const widget: WidgetDef = {
  id: 'calendar',
  title: 'Calendar',
  description: 'Year, month, week and day views of your reminders. Pinch or ctrl+scroll to zoom between them.',
  icon: '▦',
  component: Calendar,
  defaultConfig: { level: 'month' },
  keywords: ['calendar', 'agenda', 'reminders', 'schedule', 'week', 'month', 'year', 'day', 'dates'],
  paneTitle: (config) => {
    const level = typeof config.level === 'string' ? config.level : 'month';
    return `Calendar · ${level}`;
  },
};

export default widget;
