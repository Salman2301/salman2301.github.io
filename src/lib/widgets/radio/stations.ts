/**
 * Free, ad-free radio from SomaFM (listener-supported, https://somafm.com).
 * The streams are plain MP3 over HTTPS, so they play in a native <audio>
 * element and the whole player is drawn in the active theme: no iframe.
 * Every station lists two hosts; the player falls back to the second one
 * when the first will not connect.
 */

export interface Station {
  /** Short word for the terminal, e.g. "radio groove". */
  slug: string;
  name: string;
  /** One line shown under the name. */
  note: string;
  urls: string[];
}

const station = (slug: string, name: string, note: string): Station => ({
  slug,
  name,
  note,
  urls: [`https://ice2.somafm.com/${slug}-128-mp3`, `https://ice6.somafm.com/${slug}-128-mp3`],
});

export const STATIONS: Station[] = [
  station('groovesalad', 'Groove Salad', 'a nicely chilled plate of ambient and downtempo beats'),
  station('dronezone', 'Drone Zone', 'atmospheric textures with minimal beats'),
  station('deepspaceone', 'Deep Space One', 'deep ambient electronic for inner and outer space'),
  station('lush', 'Lush', 'mellow, sensuous vocals with an electronic edge'),
  station('fluid', 'Fluid', 'liquid instrumental hip hop and future soul'),
  station('secretagent', 'Secret Agent', 'lounge soundtrack for stylish, mysterious evenings'),
];

export const DEFAULT_STATION = STATIONS[0];

/** A station by its slug or name, ignoring case. */
export function findStation(text: string): Station | undefined {
  const needle = text.trim().toLowerCase();
  return STATIONS.find((s) => s.slug === needle || s.name.toLowerCase() === needle);
}
