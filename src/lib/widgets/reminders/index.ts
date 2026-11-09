import type { WidgetDef } from '../../core/types';
import Reminders from './Reminders.svelte';

const widget: WidgetDef = {
  id: 'reminders',
  title: 'Reminders',
  description: 'Upcoming reminders from tasks and notes: overdue, today, tomorrow, this week. Add one with "call mom @tmrw".',
  icon: '◔',
  component: Reminders,
  keywords: ['reminders', 'due', 'agenda', 'upcoming', 'alerts', 'today', 'tomorrow', 'schedule'],
};

export default widget;
