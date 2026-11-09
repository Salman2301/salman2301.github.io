import type { MediaItem, Preset } from './media';

/**
 * Long-running live streams from established channels. Every id was checked
 * against https://www.youtube.com/oembed (HTTP 200 means it exists and may
 * be embedded).
 */
const live = (slug: string, name: string, note: string, id: string): Preset => ({
  slug,
  name,
  note,
  item: { kind: 'video', id, title: name },
});

export const YOUTUBE_PRESETS: Preset[] = [
  live('lofi', 'lofi hip hop radio', 'Lofi Girl · beats to relax/study to, 24/7', 'jfKfPfyJRdk'),
  live('synthwave', 'synthwave radio', 'Lofi Girl · retro chillwave to chill/game to', '4xDzrJKXOOY'),
  live('chillhop', 'Chillhop radio', 'Chillhop Music · jazzy lofi beats, 24/7', '5yx6BWlEVcY'),
  live('jazz', 'jazz lofi radio', 'Lofi Girl · mellow jazz beats to chill/study to', 'HuFYqnbVbzY'),
  live('cafe', 'relaxing jazz piano', 'Cafe Music BGM · slow jazz for work, 24/7', 'Dx5qFachd3A'),
  live('rain', 'gentle rain ambience', 'Lofi Girl · rain sounds, no music', '-OekvEFm1lo'),
  live('ambient', 'dark ambient radio', 'Lofi Girl · drifting ambient to escape to', 'S_MOd40zlYU'),
  live('classical', 'classical music radio', 'Lofi Girl · relaxing classics to read/study to', 'jXAEIWcGXwE'),
  live('piano', 'classical piano & fireplace', 'Odd Eagle · Mozart, Chopin, Satie, 24/7', 'y6TZHLAzg5o'),
  live('coding', 'code-fi beats', 'The AMP Channel · lofi beats to code to', 'f02mOEt11OQ'),
  live('sleep', 'lofi sleep radio', 'Lofi Girl · slow beats to sleep/chill to', '28KRPhVzCus'),
];

/** The 24/7 lofi stream: the default item and the `lofi` command. */
export const LOFI: MediaItem = YOUTUBE_PRESETS[0].item;
