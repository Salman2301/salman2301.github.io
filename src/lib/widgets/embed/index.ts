import type { WidgetDef } from '../../core/types';
import Embed from './Embed.svelte';

const widget: WidgetDef = {
  id: 'embed',
  title: 'Embed',
  description: 'A web page or video inside a pane. Some sites refuse to be embedded.',
  icon: '⧉',
  component: Embed,
  defaultConfig: { url: '' },
  keywords: ['web', 'browser', 'iframe', 'page', 'url'],
  paneTitle: (config) => {
    const url = typeof config.url === 'string' ? config.url : '';
    try {
      return url ? `Embed · ${new URL(url).hostname.replace(/^www\./, '')}` : 'Embed';
    } catch {
      return 'Embed';
    }
  },
};

export default widget;
