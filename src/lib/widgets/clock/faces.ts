/**
 * The clock's faces. Analog ones are drawn by AnalogFace.svelte, each of the
 * others by its own small component (see FaceView.svelte). Every face is
 * drawn with the theme's colours, so all of them follow the theme.
 */

export interface FaceDef {
  id: string;
  name: string;
  kind: 'analog' | 'digital';
  /** One line for the gallery and `clock faces`. */
  note: string;
  /** The face shows hours as digits, so 12h / 24h applies. */
  hours?: boolean;
  /** The face already shows the date: no date line under it. */
  ownDate?: boolean;
  /** Width / height the face likes, for digital faces. */
  ratio?: number;
}

export const FACES: FaceDef[] = [
  { id: 'digital', name: 'Digital', kind: 'digital', note: 'big thin digits', hours: true },
  { id: 'analog', name: 'Minimal', kind: 'analog', note: 'twelve marks and thin hands' },
  { id: 'numerals', name: 'Numerals', kind: 'analog', note: 'classic dial with 1 to 12' },
  { id: 'roman', name: 'Roman', kind: 'analog', note: 'Roman numerals and leaf hands' },
  { id: 'station', name: 'Station', kind: 'analog', note: 'bold platform clock' },
  { id: 'pilot', name: 'Pilot', kind: 'analog', note: 'big numerals and a triangle at 12' },
  { id: 'diver', name: 'Diver', kind: 'analog', note: 'minute bezel and round markers' },
  { id: 'chrono', name: 'Chrono', kind: 'analog', note: 'weekday, 24 hour and date dials' },
  { id: 'bauhaus', name: 'Bauhaus', kind: 'analog', note: 'fine lines, small seconds, date window' },
  { id: 'day', name: 'Day and night', kind: 'analog', note: '24 hours in one turn, night shaded' },
  { id: 'arcs', name: 'Arcs', kind: 'analog', note: 'three rings fill with the time' },
  { id: 'orbit', name: 'Orbit', kind: 'analog', note: 'hour, minute and second as planets' },
  { id: 'radar', name: 'Radar', kind: 'analog', note: 'a sweep with the hands as blips' },
  { id: 'flip', name: 'Flip', kind: 'digital', note: 'split-flap cards', hours: true, ratio: 2.9 },
  { id: 'segments', name: 'Segments', kind: 'digital', note: 'seven-segment display with seconds', hours: true, ratio: 3.4 },
  { id: 'dots', name: 'Dot matrix', kind: 'digital', note: 'LED dots, a row for the seconds', hours: true, ratio: 3.2 },
  { id: 'binary', name: 'Binary', kind: 'digital', note: 'each digit in binary lights', ratio: 1.55 },
  { id: 'words', name: 'Words', kind: 'digital', note: 'a grid that spells the time', ratio: 1.02 },
  { id: 'fuzzy', name: 'Fuzzy', kind: 'digital', note: 'the time as you would say it', ratio: 2.2 },
  { id: 'terminal', name: 'Terminal', kind: 'digital', note: 'the output of date', hours: true, ownDate: true, ratio: 1.9 },
  { id: 'bars', name: 'Progress', kind: 'digital', note: 'how far through the hour, day and year', hours: true, ownDate: true, ratio: 1.7 },
  { id: 'nerd', name: 'Nerd', kind: 'digital', note: 'Unix time, ISO week, .beats and more', ownDate: true, ratio: 1.8 },
];

export const DEFAULT_FACE = FACES[0];

/** A face by its id or name, ignoring case. */
export function findFace(text: unknown): FaceDef | undefined {
  if (typeof text !== 'string') return undefined;
  const needle = text.trim().toLowerCase();
  return FACES.find((f) => f.id === needle || f.name.toLowerCase() === needle);
}

/** The face `step` places after (or before) `id`, wrapping around. */
export function stepFace(id: string, step: 1 | -1): FaceDef {
  const at = Math.max(0, FACES.findIndex((f) => f.id === id));
  return FACES[(at + step + FACES.length) % FACES.length];
}
