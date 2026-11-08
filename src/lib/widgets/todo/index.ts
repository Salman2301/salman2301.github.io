import type { WidgetDef } from '../../core/types';
import Todo from './Todo.svelte';

const widget: WidgetDef = {
  id: 'todo',
  title: 'Tasks',
  description: 'A task list that feeds the pomodoro.',
  icon: '✓',
  component: Todo,
  keywords: ['todo', 'tasks', 'list', 'checklist'],
};

export default widget;
