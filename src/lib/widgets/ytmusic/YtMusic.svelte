<script lang="ts">
  import type { Config } from '../../core/types';
  import MediaPlayer from '../youtube/MediaPlayer.svelte';
  import { YTMUSIC, YTMUSIC_DEFAULT, YTMUSIC_PRESETS } from './presets';

  export let paneId: string;
  export let focused = false;
  export let config: Config = {};
  export let updateConfig: (patch: Config) => void = () => {};
  $: void paneId;
</script>

<MediaPlayer
  source={YTMUSIC}
  presets={YTMUSIC_PRESETS}
  fallback={YTMUSIC_DEFAULT}
  {focused}
  {config}
  {updateConfig}
  hint="music.youtube.com can't be embedded, so songs, albums and playlists play through YouTube's player."
  note="music.youtube.com can't be embedded, so this plays through YouTube's player. Paste any song, album or playlist link."
/>
