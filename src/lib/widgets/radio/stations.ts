/**
 * Free radio streams the station itself publishes for listening. They are
 * plain HTTPS audio, so they play in a native <audio> element and the whole
 * player is drawn in the active theme: no iframe. Each station lists one or
 * more hosts; the player falls back to the next one when a host will not connect.
 *
 * Every address here answered with audio over HTTPS when it was added. An
 * address that redirects to plain http is no use: the browser blocks it.
 */

export const GENRES = ['eclectic', 'jazz', 'classical', 'electronic', 'chill', 'news'] as const;
export type Genre = (typeof GENRES)[number];

export interface Station {
  /** Short word for the terminal, e.g. "radio fip". */
  slug: string;
  name: string;
  /** One line shown under the name. */
  note: string;
  genre: Genre;
  /** Where the station publishes its stream, for the credit line. */
  site: string;
  urls: string[];
}

const st = (slug: string, name: string, genre: Genre, note: string, site: string, ...urls: string[]): Station => ({ slug, name, note, genre, site, urls });
const fip = (slug: string, name: string, genre: Genre, note: string, path: string) => st(slug, name, genre, note, 'https://www.radiofrance.fr/fip', `https://icecast.radiofrance.fr/${path}-midfi.mp3`);
const paradise = (slug: string, name: string, genre: Genre, note: string, path: string) => st(slug, name, genre, note, 'https://radioparadise.com', `https://stream.radioparadise.com/${path}`);

export const STATIONS: Station[] = [
  fip('fip', 'FIP', 'eclectic', 'eclectic French radio: jazz, electro, world and pop', 'fip'),
  paradise('paradise', 'Radio Paradise', 'eclectic', 'eclectic, commercial-free mix, listener-supported', 'mp3-128'),
  st('nts', 'NTS 1', 'eclectic', 'London non-profit station, live shows around the clock', 'https://www.nts.live', 'https://stream-relay-geo.ntslive.net/stream'),
  st('nts2', 'NTS 2', 'eclectic', 'the second NTS channel, different shows at the same time', 'https://www.nts.live', 'https://stream-relay-geo.ntslive.net/stream2'),
  st('wfmu', 'WFMU', 'eclectic', 'freeform, listener-supported radio from New Jersey', 'https://wfmu.org', 'https://stream0.wfmu.org/freeform-128k'),
  st('dublab', 'dublab', 'eclectic', 'non-profit DJ radio from Los Angeles', 'https://www.dublab.com', 'https://dublab.out.airtime.pro/dublab_a'),
  st('current', 'The Current', 'eclectic', 'indie and new music from Minnesota Public Radio', 'https://www.thecurrent.org', 'https://current.stream.publicradio.org/current.mp3'),
  st('nova', 'Radio Nova', 'eclectic', 'Paris radio: funk, hip-hop, world and electronic', 'https://www.nova.fr', 'https://novazz.ice.infomaniak.ch/novazz-128.mp3'),
  st('meuh', 'Radio Meuh', 'eclectic', 'ad-free funk, soul and oddities from the French Alps', 'https://www.radiomeuh.com', 'https://radiomeuh.ice.infomaniak.ch/radiomeuh-128.mp3'),
  st('kalx', 'KALX', 'eclectic', 'student and community radio from Berkeley', 'https://www.kalx.berkeley.edu', 'https://stream.kalx.berkeley.edu:8443/kalx-128.mp3'),
  fip('fipgroove', 'FIP Groove', 'eclectic', 'funk, soul and hip-hop', 'fipgroove'),
  fip('fiprock', 'FIP Rock', 'eclectic', 'rock, old and new', 'fiprock'),
  fip('fipworld', 'FIP World', 'eclectic', 'music from around the world', 'fipworld'),
  paradise('rprock', 'Radio Paradise Rock', 'eclectic', 'the rock mix', 'rock-128'),
  paradise('rpglobal', 'Radio Paradise Global', 'eclectic', 'the world music mix', 'global-128'),

  fip('fipjazz', 'FIP Jazz', 'jazz', 'jazz around the clock', 'fipjazz'),
  st('tsf', 'TSF Jazz', 'jazz', 'the Paris jazz station', 'https://www.tsfjazz.com', 'https://tsfjazz.ice.infomaniak.ch/tsfjazz-high.mp3'),
  st('swissjazz', 'Radio Swiss Jazz', 'jazz', 'jazz, soul and blues with no talk', 'https://www.radioswissjazz.ch', 'https://stream.srg-ssr.ch/srgssr/rsj/mp3/128'),
  st('wwoz', 'WWOZ', 'jazz', 'New Orleans jazz, blues and brass', 'https://www.wwoz.org', 'https://wwoz-sc.streamguys1.com/wwoz-hi.mp3'),

  st('francemusique', 'France Musique', 'classical', 'classical and jazz from Radio France', 'https://www.radiofrance.fr/francemusique', 'https://icecast.radiofrance.fr/francemusique-midfi.mp3'),
  st('wqxr', 'WQXR', 'classical', "New York's classical station", 'https://www.wqxr.org', 'https://stream.wqxr.org/wqxr'),
  st('yourclassical', 'YourClassical', 'classical', 'classical from Minnesota Public Radio', 'https://www.yourclassical.org', 'https://cms.stream.publicradio.org/cms.mp3'),
  st('swissclassic', 'Radio Swiss Classic', 'classical', 'classical with no talk', 'https://www.radioswissclassic.ch', 'https://stream.srg-ssr.ch/srgssr/rsc_de/mp3/128'),
  st('venice', 'Venice Classic Radio', 'classical', 'baroque and classical from Italy', 'https://www.veniceclassicradio.eu', 'https://uk2.streamingpulse.com/ssl/vcr1'),

  fip('fipelectro', 'FIP Electro', 'electronic', 'electronic music, from ambient to house', 'fipelectro'),
  st('nightride', 'Nightride FM', 'electronic', 'synthwave for late nights', 'https://nightride.fm', 'https://stream.nightride.fm/nightride.mp3'),
  st('chillsynth', 'Chillsynth', 'electronic', 'slow, mellow synthwave from Nightride FM', 'https://nightride.fm', 'https://stream.nightride.fm/chillsynth.mp3'),
  st('rinse', 'Rinse FM', 'electronic', 'London club music: garage, grime, house', 'https://www.rinse.fm', 'https://admin.stream.rinse.fm/proxy/rinse_uk/stream'),

  paradise('mellow', 'Radio Paradise Mellow', 'chill', 'the quiet mix', 'mellow-128'),
  st('chillhop', 'Chillhop', 'chill', 'lo-fi beats from FluxFM', 'https://www.fluxfm.de', 'https://streams.fluxfm.de/Chillhop/mp3-128/streams.fluxfm.de/'),
  st('lofi', 'laut.fm Lofi', 'chill', 'lo-fi hip-hop to work to', 'https://laut.fm/lofi', 'https://stream.laut.fm/lofi'),
  st('sleep', 'Ambient Sleeping Pill', 'chill', 'beatless ambient, no talk', 'https://ambientsleepingpill.com', 'https://radio.stereoscenic.com/asp-h'),
  st('nature', 'myNoise Pure Nature', 'chill', 'rain, forests and water, no music', 'https://mynoise.net', 'https://purenature-mynoise.radioca.st/stream'),

  st('bbc', 'BBC World Service', 'news', 'world news in English', 'https://www.bbc.co.uk/worldserviceradio', 'https://stream.live.vc.bbcmedia.co.uk/bbc_world_service'),
  st('npr', 'NPR', 'news', 'news and talk from US public radio', 'https://www.npr.org', 'https://npr-ice.streamguys1.com/live.mp3'),
  st('wnyc', 'WNYC', 'news', "New York's public radio", 'https://www.wnyc.org', 'https://fm939.wnyc.org/wnycfm'),
];

export const DEFAULT_STATION = STATIONS[0];

/** A station by its slug or name, ignoring case. */
export function findStation(text: string): Station | undefined {
  const needle = text.trim().toLowerCase();
  return STATIONS.find((s) => s.slug === needle || s.name.toLowerCase() === needle);
}
