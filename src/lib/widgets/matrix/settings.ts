import type { Config } from '../../core/types';

/** Per-pane settings of the digital rain, stored in the pane config. */

const unique = (s: string) => Array.from(new Set(Array.from(s)));

const KATAKANA = 'ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ';
const DIGITS = '0123456789';
const CODE_SYMBOLS = '{}[]()<>=+-*/%&|!?:;$#@~^_.';
const CODE_WORDS = 'const let function return async await import export sudo grep echo curl';

export const CHARSETS = {
  katakana: { label: 'kana', title: 'half-width katakana and digits', glyphs: unique(KATAKANA + DIGITS) },
  binary: { label: 'binary', title: 'zeros and ones', glyphs: ['0', '1'] },
  code: { label: 'code', title: 'JS and shell symbols and keyword letters', glyphs: unique(CODE_SYMBOLS + CODE_WORDS.replace(/ /g, '')) },
  hex: { label: 'hex', title: 'hexadecimal digits', glyphs: unique('0123456789ABCDEF') },
} as const;

export type Charset = keyof typeof CHARSETS;
export const CHARSET_IDS = Object.keys(CHARSETS) as Charset[];

export interface Range {
  min: number;
  max: number;
  step: number;
}
export const SPEED: Range = { min: 0.25, max: 3, step: 0.25 };
export const DENSITY: Range = { min: 0.25, max: 2.5, step: 0.25 };

export interface RainSettings {
  charset: Charset;
  speed: number;
  density: number;
}

export const DEFAULT_SETTINGS: RainSettings = { charset: 'katakana', speed: 1, density: 1 };

/** Snap to the range's step and clamp; anything that is not a number becomes `fallback`. */
export function snap(value: unknown, range: Range, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  const stepped = Math.round(n / range.step) * range.step;
  return Math.min(range.max, Math.max(range.min, +stepped.toFixed(2)));
}

/** Read settings from a pane config, tolerating junk from old saves or share links. */
export function readSettings(config: Config): RainSettings {
  const charset = typeof config.charset === 'string' && config.charset in CHARSETS ? (config.charset as Charset) : DEFAULT_SETTINGS.charset;
  return {
    charset,
    speed: snap(config.speed, SPEED, DEFAULT_SETTINGS.speed),
    density: snap(config.density, DENSITY, DEFAULT_SETTINGS.density),
  };
}

export function nextCharset(current: Charset, delta: 1 | -1): Charset {
  const i = CHARSET_IDS.indexOf(current);
  return CHARSET_IDS[(i + delta + CHARSET_IDS.length) % CHARSET_IDS.length];
}

export const formatFactor = (n: number) => `${n.toFixed(2).replace(/0$/, '')}x`;
