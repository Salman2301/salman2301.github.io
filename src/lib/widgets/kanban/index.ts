import type { WidgetDef } from '../../core/types';
import Kanban from './Kanban.svelte';

const widget: WidgetDef = {
  id: 'kanban',
  title: 'Kanban',
  description: "A board of a space's tasks, with a column per tag.",
  icon: '▥',
  component: Kanban,
  keywords: ['kanban', 'board', 'tags', 'columns', 'tasks'],
};

export default widget;
