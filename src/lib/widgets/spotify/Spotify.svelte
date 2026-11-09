<script lang="ts">
  import type { Config } from '../../core/types';
  import MediaPlayer from '../youtube/MediaPlayer.svelte';
  import { SPOTIFY_DEFAULT, SPOTIFY_PRESETS } from './presets';
  import { fitSpotify, SPOTIFY } from './spotify';

  export let paneId: string;
  export let focused = false;
  export let config: Config = {};
  export let updateConfig: (patch: Config) => void = () => {};
  $: void paneId;
</script>

<MediaPlayer
  source={SPOTIFY}
  presets={SPOTIFY_PRESETS}
  fallback={SPOTIFY_DEFAULT}
  fit={fitSpotify}
  {focused}
  {config}
  {updateConfig}
  note="Not logged in to Spotify in this browser? Then the player plays 30-second previews."
/>
