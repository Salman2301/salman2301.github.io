import type { WidgetDef } from '../../core/types';
import News from './News.svelte';

const widget: WidgetDef = {
  id: 'news',
  title: 'Hacker News',
  description: 'Top stories from Hacker News, refreshed every 10 minutes.',
  icon: 'Y',
  component: News,
  keywords: ['hn', 'hacker news', 'news', 'feed', 'ycombinator'],
  paneTitle: (config) => `Hacker News · ${(config.feed as string) || 'top'}`,
};

export default widget;
