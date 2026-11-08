import { getGame } from '../../core/registry';
import type { WidgetDef } from '../../core/types';
import Arcade from './Arcade.svelte';

const widget: WidgetDef = {
  id: 'arcade',
  title: 'Arcade',
  description: 'Quick mini games with saved high scores.',
  icon: '◆',
  component: Arcade,
  keywords: ['games', 'play', 'fun', 'break'],
  paneTitle: (config) => {
    const g = typeof config.game === 'string' ? getGame(config.game) : undefined;
    return g ? `Arcade · ${g.title}` : 'Arcade';
  },
};

export default widget;
