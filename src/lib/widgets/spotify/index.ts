import type { WidgetDef } from '../../core/types';
import { mediaPaneTitle } from '../media/media';
import { SPOTIFY_DEFAULT } from './presets';
import Spotify from './Spotify.svelte';

const widget: WidgetDef = {
  id: 'spotify',
  title: 'Spotify',
  description: 'Spotify playlists, albums, tracks and podcasts in a pane.',
  icon: '≋',
  component: Spotify,
  keywords: ['music', 'playlist', 'album', 'podcast', 'focus', 'lofi', 'player'],
  paneTitle: (config) => mediaPaneTitle('Spotify', config.item, SPOTIFY_DEFAULT),
};

export default widget;
