<script lang="ts">
  import type { Config } from '../../core/types';
  import MediaPlayer from './MediaPlayer.svelte';
  import { LOFI, YOUTUBE_PRESETS } from './presets';
  import { YOUTUBE } from './youtube';

  export let paneId: string;
  export let focused = false;
  export let config: Config = {};
  export let updateConfig: (patch: Config) => void = () => {};
  $: void paneId;
</script>

<MediaPlayer
  source={YOUTUBE}
  presets={YOUTUBE_PRESETS}
  fallback={LOFI}
  {focused}
  {config}
  {updateConfig}
  note="Plays through YouTube's privacy-enhanced player (youtube-nocookie.com). Tip: / jumps to the link box, p opens this menu."
/>
