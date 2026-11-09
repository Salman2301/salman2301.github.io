import type { MediaItem, Preset } from '../youtube/media';

/**
 * Spotify editorial playlists for focus and coding. Every id was checked
 * against https://open.spotify.com/oembed (HTTP 200).
 */
const playlist = (slug: string, name: string, note: string, id: string): Preset => ({
  slug,
  name,
  note,
  item: { kind: 'playlist', id, title: name },
});

export const SPOTIFY_PRESETS: Preset[] = [
  playlist('lofi', 'lofi beats', 'chill instrumental beats', '37i9dQZF1DWWQRwui0ExPn'),
  playlist('study', 'chill lofi study beats', 'soft lofi to study to', '37i9dQZF1DX8Uebhn9wzrS'),
  playlist('focus', 'Deep Focus', 'ambient and post-rock to stay in the zone', '37i9dQZF1DWZeKCadgRdKQ'),
  playlist('coding', 'Coding Mode', 'electronic music for programmers', '37i9dQZF1DX5trt9i14X7j'),
  playlist('brain', 'Brain Food', 'atmospheric electronic for deep work', '37i9dQZF1DWXLeA8Omikj7'),
  playlist('flow', 'Focus Flow', 'uptempo instrumental hip hop', '37i9dQZF1DWZZbwlv3Vmtr'),
  playlist('jazz', 'Jazz in the Background', 'quiet jazz while you work', '37i9dQZF1DWV7EzJMK2FUI'),
  playlist('piano', 'Peaceful Piano', 'relaxing solo piano', '37i9dQZF1DX4sWSpwq3LiO'),
  playlist('classical', 'Music for Concentration', 'classical focus pieces', '37i9dQZF1DX3PFzdbtx1Us'),
];

export const SPOTIFY_DEFAULT: MediaItem = SPOTIFY_PRESETS[0].item;
