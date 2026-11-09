import type { MediaItem, Preset } from './media';

/**
 * Long-running live streams from established channels. Every id was checked
 * against https://www.youtube.com/oembed and then loaded in the embedded
 * player: oEmbed still answers 200 for a stream that has ended (with an
 * empty author_name), so a 200 alone is not enough. Lofi Girl restarts its
 * streams now and then under new ids; the old jfKfPfyJRdk is one of those.
 */
const live = (slug: string, name: string, note: string, id: string): Preset => ({
  slug,
  name,
  note,
  item: { kind: 'video', id, title: name },
});

export const YOUTUBE_PRESETS: Preset[] = [
  live('lofi', 'lofi hip hop radio', 'Lofi Girl · beats to relax/study to, 24/7', 'rFZHOHl-L8A'),
  live('synthwave', 'synthwave radio', 'Lofi Girl · retro chillwave to chill/game to', '4xDzrJKXOOY'),
  live('chillhop', 'Chillhop radio', 'Chillhop Music · jazzy lofi beats, 24/7', '5yx6BWlEVcY'),
  live('jazz', 'jazz lofi radio', 'Lofi Girl · mellow jazz beats to chill/study to', 'E2vONfzoyRI'),
  live('cafe', 'relaxing jazz piano', 'Cafe Music BGM · slow jazz for work, 24/7', 'Dx5qFachd3A'),
  live('rain', 'gentle rain ambience', 'Lofi Girl · rain sounds, no music', '-OekvEFm1lo'),
  live('ambient', 'dark ambient radio', 'Lofi Girl · drifting ambient to escape to', 'S_MOd40zlYU'),
  live('classical', 'classical music radio', 'Lofi Girl · relaxing classics to read/study to', 'jXAEIWcGXwE'),
  live('piano', 'classical piano & fireplace', 'Odd Eagle · Mozart, Chopin, Satie, 24/7', 'y6TZHLAzg5o'),
  live('coding', 'code-fi beats', 'The AMP Channel · lofi beats to code to', 'f02mOEt11OQ'),
  live('sleep', 'lofi sleep radio', 'Lofi Girl · slow beats to sleep/chill to', 'JD-kMIpDfnY'),
];

/** The 24/7 lofi stream: the default item and the `lofi` command. */
export const LOFI: MediaItem = YOUTUBE_PRESETS[0].item;
