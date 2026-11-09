/**
 * Free radio streams the station itself publishes for listening. They are
 * plain HTTPS audio, so they play in a native <audio> element and the whole
 * player is drawn in the active theme: no iframe. Each station lists one or
 * more hosts; the player falls back to the next one when a host will not connect.
 */

export interface Station {
  /** Short word for the terminal, e.g. "radio fip". */
  slug: string;
  name: string;
  /** One line shown under the name. */
  note: string;
  /** Where the station publishes its stream, for the credit line. */
  site: string;
  urls: string[];
}

export const STATIONS: Station[] = [
  {
    slug: 'fip',
    name: 'FIP',
    note: 'eclectic French radio: jazz, electro, world and pop',
    site: 'https://www.radiofrance.fr/fip',
    urls: ['https://icecast.radiofrance.fr/fip-midfi.mp3'],
  },
  {
    slug: 'kexp',
    name: 'KEXP',
    note: 'independent, non-commercial radio from Seattle',
    site: 'https://www.kexp.org',
    urls: ['https://kexp-mp3-128.streamguys1.com/kexp128.mp3'],
  },
  {
    slug: 'paradise',
    name: 'Radio Paradise',
    note: 'eclectic, commercial-free mix, listener-supported',
    site: 'https://radioparadise.com',
    urls: ['https://stream.radioparadise.com/mp3-128'],
  },
  {
    slug: 'nts',
    name: 'NTS 1',
    note: 'London non-profit station, live shows around the clock',
    site: 'https://www.nts.live',
    urls: ['https://stream-relay-geo.ntslive.net/stream'],
  },
  {
    slug: 'nts2',
    name: 'NTS 2',
    note: 'the second NTS channel, different shows at the same time',
    site: 'https://www.nts.live',
    urls: ['https://stream-relay-geo.ntslive.net/stream2'],
  },
];

export const DEFAULT_STATION = STATIONS[0];

/** A station by its slug or name, ignoring case. */
export function findStation(text: string): Station | undefined {
  const needle = text.trim().toLowerCase();
  return STATIONS.find((s) => s.slug === needle || s.name.toLowerCase() === needle);
}
