import type { MediaItem, Preset } from '../youtube/media';
import { youtubeSource } from '../youtube/youtube';

/**
 * music.youtube.com refuses to be framed, so YouTube Music links play
 * through the regular YouTube embed. Same parser, music wording.
 */
export const YTMUSIC = youtubeSource({
  widget: 'ytmusic',
  name: 'YouTube Music',
  invalidHint: 'Not a YouTube Music or YouTube link. Paste a song, album or playlist link (Share > Copy link), or a video id.',
  placeholder: 'paste a music.youtube.com or YouTube link',
  shortPlaceholder: 'music link or id',
});

/**
 * Long playlists from established music channels. Every list was checked
 * against https://www.youtube.com/oembed (HTTP 200). YouTube Music's own
 * curated lists (RDCLAK5uy...) fail that check, so none are preset here,
 * though pasting one still works.
 */
const playlist = (slug: string, name: string, note: string, id: string): Preset => ({
  slug,
  name,
  note,
  item: { kind: 'playlist', id, title: name },
});

export const YTMUSIC_PRESETS: Preset[] = [
  playlist('lofi', 'Lofi Girl mixes', 'Lofi Girl · hour-long lofi compilations', 'PL6NdkXsPL07KN01gH2vucrHCEyyNmVEx4'),
  playlist('chillhop', 'Chillhop Essentials', 'Chillhop Music · seasonal jazzy beat tapes', 'PLt7bG0K25iXjvB28Upp4YU_LvLS2MFbLr'),
  playlist('synthwave', 'chillwave & synthwave', 'retrowave and chillwave for night drives', 'PLOtNYlNIGer0jmWpFtTWqMkfP56iuZg1w'),
  playlist('jazz', 'work & study jazz', 'live-band jazz for focus', 'PL2wLrxxhuoN5QfB56SMOuIIynXWk-4yT3'),
  playlist('classical', 'classical for working', 'HALIDONMUSIC · calm classical pieces', 'PLcGkkXtask_eYr5C29azb7JHrEA2KsziK'),
  playlist('ambient', 'ambient focus', 'ambient electronica for deep work', 'PLxUtKZKzxHGL4X7K1tiocImUCl6F5m8ZD'),
  playlist('downtempo', 'downtempo', 'deep, atmospheric chill music', 'PLYkB2GLfxxJcleXAzNz0qZH_mOtIQrhvS'),
  playlist('gaming', 'game music for studying', 'calm video game soundtracks', 'PLx38H1y4jw0kWCxU1Tia7vLCX4m4UW0FH'),
  playlist('japan', 'japanese lofi hip hop', 'the bootleg boy · city-pop flavoured lofi', 'PLOzDu-MXXLljymo0oXEkTSLKf5TqxY-JN'),
];

export const YTMUSIC_DEFAULT: MediaItem = YTMUSIC_PRESETS[0].item;
