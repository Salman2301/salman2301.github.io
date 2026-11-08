import type { WidgetDef } from '../../core/types';
import Terminal from './Terminal.svelte';

const widget: WidgetDef = {
  id: 'terminal',
  title: 'Terminal',
  description: 'The shell. Type "help" for every command.',
  icon: '>_',
  component: Terminal,
  keywords: ['shell', 'console', 'cli', 'bash'],
};

export default widget;
