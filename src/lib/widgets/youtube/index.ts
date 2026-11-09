import type { WidgetDef } from '../../core/types';
import { mediaPaneTitle } from './media';
import { LOFI } from './presets';
import YouTube from './YouTube.svelte';

const widget: WidgetDef = {
  id: 'youtube',
  title: 'YouTube',
  description: 'Videos, live streams and playlists. Starts on the 24/7 lofi stream.',
  icon: '▷',
  component: YouTube,
  keywords: ['video', 'music', 'lofi', 'stream', 'live', 'playlist', 'yt', 'player'],
  paneTitle: (config) => mediaPaneTitle('YouTube', config.item, LOFI),
};

export default widget;
