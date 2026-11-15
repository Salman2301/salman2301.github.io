/**
 * A small QR code encoder (byte mode, error correction level M, versions 1
 * to 20), for the "sync share" code a phone scans. It follows the standard
 * (ISO/IEC 18004) the same way Project Nayuki's reference encoder does:
 * place the fixed patterns, add Reed-Solomon error correction, lay the bits
 * out in the zigzag, then keep the mask with the lowest penalty.
 */

/** Error correction codewords per block, level M, by version (index 0 unused). */
const ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26];
/** Number of error correction blocks, level M, by version. */
const BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16];
const MAX_VERSION = 20;
/** Format bits for level M. */
const ECL_BITS = 0;

/** Dark modules, row by row: `modules[y][x]`. */
export type QrMatrix = boolean[][];

function rawModules(ver: number): number {
  let n = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const align = Math.floor(ver / 7) + 2;
    n -= (25 * align - 10) * align - 55;
    if (ver >= 7) n -= 36;
  }
  return n;
}

const dataCodewords = (ver: number) => Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver] * BLOCKS[ver];

/* --------------------------------------------------------- Reed-Solomon */

function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree: number): number[] {
  const out = new Array<number>(degree).fill(0);
  out[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      out[j] = gfMul(out[j], root);
      if (j + 1 < degree) out[j] ^= out[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return out;
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const out = new Array<number>(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ (out.shift() as number);
    out.push(0);
    divisor.forEach((coef, i) => (out[i] ^= gfMul(coef, factor)));
  }
  return out;
}

/** The data codewords split into blocks, each with its error correction, interleaved. */
function withEcc(data: number[], ver: number): number[] {
  const blocks = BLOCKS[ver];
  const eccLen = ECC_PER_BLOCK[ver];
  const raw = Math.floor(rawModules(ver) / 8);
  const shortBlocks = blocks - (raw % blocks);
  const shortLen = Math.floor(raw / blocks);
  const div = rsDivisor(eccLen);
  const all: number[][] = [];
  for (let i = 0, k = 0; i < blocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < shortBlocks ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, div);
    if (i < shortBlocks) dat.push(0);
    all.push(dat.concat(ecc));
  }
  const out: number[] = [];
  for (let i = 0; i < all[0].length; i++) {
    all.forEach((block, j) => {
      // the padding byte of a short block is not sent
      if (i !== shortLen - eccLen || j >= shortBlocks) out.push(block[i]);
    });
  }
  return out;
}

/* --------------------------------------------------------------- layout */

class Grid {
  size: number;
  mod: boolean[][];
  fn: boolean[][];
  constructor(readonly ver: number) {
    this.size = ver * 4 + 17;
    this.mod = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
    this.fn = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
  }
  set(x: number, y: number, dark: boolean) {
    this.mod[y][x] = dark;
    this.fn[y][x] = true;
  }
  alignPositions(): number[] {
    if (this.ver === 1) return [];
    const n = Math.floor(this.ver / 7) + 2;
    const step = Math.floor((this.ver * 8 + n * 3 + 5) / (n * 4 - 4)) * 2;
    const out = [6];
    for (let pos = this.size - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
    return out;
  }
  patterns() {
    const s = this.size;
    for (let i = 0; i < s; i++) {
      this.set(6, i, i % 2 === 0);
      this.set(i, 6, i % 2 === 0);
    }
    for (const [cx, cy] of [
      [3, 3],
      [s - 4, 3],
      [3, s - 4],
    ]) {
      for (let dy = -4; dy <= 4; dy++)
        for (let dx = -4; dx <= 4; dx++) {
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          const x = cx + dx;
          const y = cy + dy;
          if (x >= 0 && x < s && y >= 0 && y < s) this.set(x, y, d !== 2 && d !== 4);
        }
    }
    const pos = this.alignPositions();
    const last = pos.length - 1;
    pos.forEach((px, i) =>
      pos.forEach((py, j) => {
        if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) this.set(px + dx, py + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }),
    );
    this.format(0); // reserved now, written for real once the mask is known
    if (this.ver >= 7) {
      let rem = this.ver;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const bits = (this.ver << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const dark = ((bits >>> i) & 1) !== 0;
        const a = s - 11 + (i % 3);
        const b = Math.floor(i / 3);
        this.set(a, b, dark);
        this.set(b, a, dark);
      }
    }
  }
  format(mask: number) {
    const data = (ECL_BITS << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((bits >>> i) & 1) !== 0;
    const s = this.size;
    for (let i = 0; i <= 5; i++) this.set(8, i, bit(i));
    this.set(8, 7, bit(6));
    this.set(8, 8, bit(7));
    this.set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) this.set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) this.set(s - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) this.set(8, s - 15 + i, bit(i));
    this.set(8, s - 8, true); // the dark module
  }
  codewords(data: number[]) {
    const s = this.size;
    let i = 0;
    for (let right = s - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let v = 0; v < s; v++)
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const up = ((right + 1) & 2) === 0;
          const y = up ? s - 1 - v : v;
          if (!this.fn[y][x] && i < data.length * 8) {
            this.mod[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
        }
    }
  }
  mask(m: number) {
    const s = this.size;
    for (let y = 0; y < s; y++)
      for (let x = 0; x < s; x++) {
        if (this.fn[y][x]) continue;
        const flip =
          m === 0 ? (x + y) % 2 === 0
          : m === 1 ? y % 2 === 0
          : m === 2 ? x % 3 === 0
          : m === 3 ? (x + y) % 3 === 0
          : m === 4 ? (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0
          : m === 5 ? ((x * y) % 2) + ((x * y) % 3) === 0
          : m === 6 ? (((x * y) % 2) + ((x * y) % 3)) % 2 === 0
          : (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
        if (flip) this.mod[y][x] = !this.mod[y][x];
      }
  }
  /** Rules 1, 2 and 4 of the standard's penalty: long runs, 2x2 blocks, dark/light balance. */
  penalty(): number {
    const s = this.size;
    const m = this.mod;
    let p = 0;
    for (let y = 0; y < s; y++) {
      let run = 1;
      for (let x = 1; x <= s; x++) {
        if (x < s && m[y][x] === m[y][x - 1]) run++;
        else {
          if (run >= 5) p += run - 2;
          run = 1;
        }
      }
    }
    for (let x = 0; x < s; x++) {
      let run = 1;
      for (let y = 1; y <= s; y++) {
        if (y < s && m[y][x] === m[y - 1][x]) run++;
        else {
          if (run >= 5) p += run - 2;
          run = 1;
        }
      }
    }
    for (let y = 0; y < s - 1; y++) for (let x = 0; x < s - 1; x++) if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
    let dark = 0;
    for (const row of m) for (const v of row) if (v) dark++;
    p += Math.floor(Math.abs(dark * 20 - s * s * 10) / (s * s)) * 10;
    return p;
  }
}

/** Encode text (as UTF-8) into a QR code. Throws when it is too long for version 20. */
export function encodeQr(text: string): QrMatrix {
  const bytes = Array.from(new TextEncoder().encode(text));
  let ver = 1;
  for (; ver <= MAX_VERSION; ver++) {
    const countBits = ver <= 9 ? 8 : 16;
    if (4 + countBits + bytes.length * 8 <= dataCodewords(ver) * 8) break;
  }
  if (ver > MAX_VERSION) throw new Error('too long for a QR code');
  const capacity = dataCodewords(ver) * 8;

  const bits: number[] = [];
  const put = (value: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  put(0b0100, 4); // byte mode
  put(bytes.length, ver <= 9 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, capacity - bits.length)); // terminator
  put(0, (8 - (bits.length % 8)) % 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; data.length < capacity / 8; pad ^= 0xec ^ 0x11) data.push(pad);

  const grid = new Grid(ver);
  grid.patterns();
  grid.codewords(withEcc(data, ver));
  let best = 0;
  let bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    grid.mask(m);
    grid.format(m);
    const score = grid.penalty();
    if (score < bestScore) {
      best = m;
      bestScore = score;
    }
    grid.mask(m); // masking twice undoes it
  }
  grid.mask(best);
  grid.format(best);
  return grid.mod;
}

/** The code as one SVG path (dark modules), with a quiet zone of `margin` modules. */
export function qrPath(m: QrMatrix, margin = 4): { d: string; size: number } {
  let d = '';
  m.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x + margin} ${y + margin}h1v1h-1z`;
    }),
  );
  return { d, size: m.length + margin * 2 };
}
