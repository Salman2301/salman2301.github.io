import type { WidgetDef } from '../../core/types';
import Pomodoro from './Pomodoro.svelte';
import './engine';

const widget: WidgetDef = {
  id: 'pomodoro',
  title: 'Pomodoro',
  description: 'Focus timer with breaks, task tracking and daily stats.',
  icon: '◷',
  component: Pomodoro,
  keywords: ['timer', 'focus', 'tomato', 'productivity'],
};

export default widget;
