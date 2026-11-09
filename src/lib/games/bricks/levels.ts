/**
 * Brick layouts. Each level is a grid of characters, centred into COLS:
 *   .      empty
 *   1 2 3  a brick with that many hit points
 *   #      steel, unbreakable
 *   *      one hit point and always drops a power-up
 * After the hand-made levels, layouts are generated from the level number,
 * so level 12 always looks the same.
 */

export const COLS = 15;
export const MAX_ROWS = 10;

export interface LevelDef {
  name: string;
  rows: string[];
}

export interface Cell {
  hp: number;
  max: number;
  steel: boolean;
  drop: boolean;
}

export type Grid = (Cell | null)[][];

export const LEVELS: LevelDef[] = [
  {
    name: 'prompt',
    rows: [
      '22...........',
      '.22..........',
      '..22.........',
      '...22........',
      '....2*.......',
      '...22........',
      '..22.........',
      '.22....111111',
      '22.....11*111',
    ],
  },
  {
    name: 'braces',
    rows: [
      '...22.....22...',
      '..2..11111..2..',
      '..2...1111..2..',
      '.2...111*1...2.',
      '2.....111.....2',
      '.2...11111...2.',
      '..2..1*11...2..',
      '..2...111...2..',
      '...22.....22...',
    ],
  },
  {
    name: 'heart',
    rows: [
      '..222...222..',
      '.21112.21112.',
      '2111112111112',
      '211*11111*112',
      '.21111111112.',
      '..211131112..',
      '...2111112...',
      '....21112....',
      '.....212.....',
      '......2......',
    ],
  },
  {
    name: 'rocket',
    rows: [
      '......3......',
      '.....323.....',
      '.....222.....',
      '....22222....',
      '....21112....',
      '....21*12....',
      '....21112....',
      '...#22222#...',
      '..##22222##..',
      '..#.1.1.1.#..',
    ],
  },
  {
    name: 'tag',
    rows: [
      '...2.....3.2...',
      '..2.....3...2..',
      '.2......3....2.',
      '2......3......2',
      '.2....3......2.',
      '..2...3.....2..',
      '...2.3.....2...',
      '...............',
      '#1*111111111*1#',
    ],
  },
  {
    name: 'floppy',
    rows: [
      '2222#####222.',
      '2222#..##2222',
      '2222#####2222',
      '2222222222222',
      '2111111111112',
      '21*1111111*12',
      '2111111111112',
      '2111111111112',
      '2222222222222',
    ],
  },
  {
    name: 'mug',
    rows: [
      '..1...1...1..',
      '...1...1...1.',
      '..1...1...1..',
      '.............',
      '3333333333...',
      '3222222223333',
      '32*2222*23..3',
      '3222222223..3',
      '3222222223333',
      '.33333333....',
    ],
  },
  {
    name: 'chip',
    rows: [
      '..#.#.#.#.#..',
      '.33333333333.',
      '#31111111113#',
      '.31222222213.',
      '#3122*3*2213#',
      '.31222222213.',
      '#31111111113#',
      '.33333333333.',
      '..#.#.#.#.#..',
    ],
  },
];

/** Small seeded PRNG so generated levels are stable for a given number. */
export function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Motif = (row: number, col: number, rows: number, rnd: () => number) => boolean;

// Every motif is evaluated on the left half (col 0 = edge, 7 = centre) and mirrored.
const MOTIFS: Record<string, Motif> = {
  diamond: (r, c, rows) => 7 - c + Math.abs(r - (rows - 1) / 2) * 1.5 <= 7.5,
  checker: (r, c) => (r + c) % 2 === 0,
  waves: (r, c) => Math.abs(r - 4 - Math.round(2 * Math.sin(c * 0.8))) <= 1,
  rings: (r, c, rows) => Math.max(7 - c, Math.abs(r - (rows - 1) / 2) * 1.7) % 3 < 1.9,
  columns: (_r, c) => c % 3 !== 1,
  noise: (_r, _c, _rows, rnd) => rnd() < 0.6,
};

/** A symmetric generated layout for levels past the hand-made ones. */
export function generate(level: number): LevelDef {
  const rnd = seeded(level * 7919 + 17);
  const names = Object.keys(MOTIFS);
  const name = names[Math.floor(rnd() * names.length)];
  const motif = MOTIFS[name];
  const rows = 7 + Math.floor(rnd() * 3);
  const extra = level - LEVELS.length;
  const steelChance = Math.min(0.1, 0.03 + extra * 0.006);
  const half = Math.ceil(COLS / 2);

  for (let attempt = 0; attempt < 8; attempt++) {
    const out: string[] = [];
    for (let r = 0; r < rows; r++) {
      const left: string[] = [];
      for (let c = 0; c < half; c++) {
        const filled = attempt > 3 ? rnd() < 0.55 : motif(r, c, rows, rnd);
        if (!filled) left.push('.');
        else if (rnd() < steelChance) left.push('#');
        else if (rnd() < 0.05) left.push('*');
        else {
          const base = 1 + Math.min(2, Math.floor(extra / 4));
          const hp = base + (r < rows / 3 ? 1 : 0) + (rnd() < 0.15 ? 1 : 0) - (rnd() < 0.25 ? 1 : 0);
          left.push(String(Math.max(1, Math.min(3, hp))));
        }
      }
      out.push(left.join('') + left.slice(0, COLS - half).reverse().join(''));
    }
    const grid = isolateSteel(out);
    if (breakableCount(grid) >= 24) return { name: `${name}.gen`, rows: grid };
  }
  return { name: 'fallback.gen', rows: Array.from({ length: 6 }, () => '2'.repeat(COLS)) };
}

/**
 * Steel next to steel (even diagonally) becomes a 3 hit point brick, so
 * unbreakable cells can never wall off a pocket of breakable ones.
 */
function isolateSteel(rows: string[]): string[] {
  const at = (r: number, c: number) => rows[r]?.[c] === '#';
  return rows.map((row, r) =>
    row
      .split('')
      .map((ch, c) => {
        if (ch !== '#') return ch;
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && at(r + dr, c + dc)) return '3';
        return ch;
      })
      .join(''),
  );
}

function breakableCount(rows: string[]): number {
  return rows.join('').replace(/[.#]/g, '').length;
}

export function levelAt(index: number): LevelDef {
  return index < LEVELS.length ? LEVELS[index] : generate(index);
}

/** Parse a layout into cells, centring each row into COLS columns. */
export function parse(def: LevelDef): Grid {
  const width = Math.max(...def.rows.map((r) => r.length));
  const pad = Math.floor((COLS - width) / 2);
  return def.rows.slice(0, MAX_ROWS).map((row) => {
    const line = ('.'.repeat(pad) + row.padEnd(width, '.')).padEnd(COLS, '.');
    return line
      .slice(0, COLS)
      .split('')
      .map((ch): Cell | null => {
        if (ch === '#') return { hp: 1, max: 1, steel: true, drop: false };
        if (ch === '*') return { hp: 1, max: 1, steel: false, drop: true };
        const hp = Number(ch);
        return hp >= 1 && hp <= 3 ? { hp, max: hp, steel: false, drop: false } : null;
      });
  });
}
