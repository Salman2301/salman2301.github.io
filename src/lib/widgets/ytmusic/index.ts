import type { WidgetDef } from '../../core/types';
import { mediaPaneTitle } from '../youtube/media';
import { YTMUSIC_DEFAULT } from './presets';
import YtMusic from './YtMusic.svelte';

const widget: WidgetDef = {
  id: 'ytmusic',
  title: 'YouTube Music',
  description: 'YouTube Music songs, albums and playlists, played through the YouTube player.',
  icon: '♫',
  component: YtMusic,
  keywords: ['music', 'youtube music', 'ytm', 'playlist', 'album', 'songs', 'lofi', 'player'],
  paneTitle: (config) => mediaPaneTitle('YouTube Music', config.item, YTMUSIC_DEFAULT),
};

export default widget;
