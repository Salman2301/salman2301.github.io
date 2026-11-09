import { CLEAR_WORDS, SLOW_WORDS, TIERS, pick, type WordKind } from './words';

/**
 * Typing Defense rules, free of any DOM so the component only renders and
 * feeds keys. Positions are normalised: x is a slot in the free width of the
 * field, y runs from 0 (top edge) to 1 (the base line), so the game plays the
 * same in a tiny pane and full screen.
 */

export interface Word {
  id: number;
  text: string;
  kind: WordKind;
  /** 0..1 across the width left over once the word itself is placed. */
  x: number;
  /** 0 at the top edge, 1 on the base line. */
  y: number;
  /** Field heights per second. */
  speed: number;
  /** Letters typed so far; only the locked target has any. */
  typed: number;
}

export interface Burst {
  id: number;
  x: number;
  y: number;
  len: number;
  points: number;
  kind: WordKind;
  at: number;
}

export interface Banner {
  id: number;
  title: string;
  sub: string;
  until: number;
}

export type TyperEvent = 'key' | 'miss' | 'kill' | 'special' | 'breach' | 'wave' | 'over';

const LIVES = 3;
const SLOW_FACTOR = 0.4;
const SLOW_SECONDS = 6;
const WAVE_BREAK = 2.4;
const MAX_MULTIPLIER = 5;
const COMBO_STEP = 5;

export function waveSpec(wave: number) {
  const n = wave - 1;
  const short = Math.max(0.15, 0.8 - n * 0.1);
  const long = Math.min(0.45, 0.04 + n * 0.06);
  return {
    count: 6 + wave * 2,
    /** Seconds a word needs to fall the whole field. */
    fall: Math.max(4.6, 12 - n * 0.8),
    /** Seconds between spawns. */
    gap: Math.max(0.7, 2.6 - n * 0.2),
    weights: [short, Math.max(0, 1 - short - long), long],
  };
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const lower = (s: string) => s.toLowerCase();

export class TyperRun {
  words: Word[] = [];
  bursts: Burst[] = [];
  banner: Banner | null = null;
  target: Word | null = null;
  lives = LIVES;
  readonly maxLives = LIVES;
  score = 0;
  combo = 0;
  bestCombo = 0;
  wave = 0;
  time = 0;
  slowUntil = 0;
  breachAt = -10;
  missAt = -10;
  over = false;
  /** Field width in characters, so new words avoid the ones above them. */
  fieldChars = 40;

  private correct = 0;
  private keystrokes = 0;
  /** Seconds with words on screen: the WPM clock skips wave breaks. */
  private typingTime = 0;
  private spawned = 0;
  private spawnIn = 0;
  private breakLeft = 0;
  private nextId = 1;

  constructor(private emit: (e: TyperEvent) => void = () => {}) {
    this.startWave(1);
  }

  get multiplier(): number {
    return Math.min(MAX_MULTIPLIER, 1 + Math.floor(this.combo / COMBO_STEP));
  }

  get slowLeft(): number {
    return Math.max(0, this.slowUntil - this.time);
  }

  get wpm(): number {
    const minutes = this.typingTime / 60;
    return minutes > 0.02 ? Math.round(this.correct / 5 / minutes) : 0;
  }

  get accuracy(): number {
    return this.keystrokes ? Math.round((this.correct / this.keystrokes) * 100) : 100;
  }

  summary(): string {
    return `${this.wpm} wpm · ${this.accuracy}% accuracy · wave ${this.wave}`;
  }

  update(dt: number) {
    if (this.over) return;
    this.time += dt;
    if (this.words.length) this.typingTime += dt;
    const pace = this.time < this.slowUntil ? SLOW_FACTOR : 1;

    if (this.breakLeft > 0) {
      this.breakLeft -= dt;
      if (this.breakLeft <= 0) this.startWave(this.wave + 1);
    } else this.spawnTick(dt * pace);

    for (const w of this.words) w.y += w.speed * pace * dt;
    for (const w of this.words.filter((w) => w.y >= 1)) this.breach(w);

    this.bursts = this.bursts.filter((b) => this.time - b.at < 0.9);
    if (this.banner && this.time > this.banner.until) this.banner = null;
    if (!this.over && this.breakLeft <= 0 && this.spawned >= waveSpec(this.wave).count && !this.words.length) this.clearWave();
  }

  /** Feed one typed character (any case). */
  typeChar(c: string) {
    if (this.over || !this.words.length) return;
    if (!this.target && c === ' ') return; // a stray space between words is free
    this.keystrokes++;
    const prefix = (this.target ? this.target.text.slice(0, this.target.typed) : '') + c;
    const next = this.target && lower(this.target.text).startsWith(lower(prefix)) ? this.target : this.findByPrefix(prefix);
    if (!next) return this.miss();
    if (next !== this.target) {
      if (this.target) this.target.typed = 0;
      this.target = next;
    }
    next.typed = prefix.length;
    this.correct++;
    this.emit('key');
    if (next.typed >= next.text.length) this.destroy(next);
  }

  /** Undo the last letter of the target; releases it at zero. */
  backspace() {
    if (this.over || !this.target) return;
    this.target.typed--;
    if (this.target.typed <= 0) {
      this.target.typed = 0;
      this.target = null;
    }
  }

  private startWave(n: number) {
    this.wave = n;
    this.spawned = 0;
    this.spawnIn = 0.8;
    const spec = waveSpec(n);
    this.showBanner(`wave ${n}`, n === 1 ? 'type a word to lock on' : `${spec.count} words incoming`, 1.8);
  }

  private clearWave() {
    const bonus = this.wave * 100;
    this.score += bonus;
    this.breakLeft = WAVE_BREAK;
    this.showBanner(`wave ${this.wave} clear`, `+${bonus} bonus`, WAVE_BREAK - 0.3);
    this.emit('wave');
  }

  private spawnTick(dt: number) {
    const spec = waveSpec(this.wave);
    if (this.spawned >= spec.count) return;
    this.spawnIn -= dt;
    if (this.spawnIn > 0) return;
    this.spawn();
    this.spawnIn = spec.gap * rand(0.8, 1.2);
  }

  private spawn() {
    const spec = waveSpec(this.wave);
    const hasSpecial = this.words.some((w) => w.kind !== 'normal');
    const kind: WordKind = this.wave >= 2 && !hasSpecial && Math.random() < 0.09 ? (Math.random() < 0.5 ? 'clear' : 'slow') : 'normal';
    const text = this.pickText(kind, spec.weights);
    this.words.push({
      id: this.nextId++,
      text,
      kind,
      x: this.placeX(text.length),
      y: 0,
      speed: (1 / spec.fall) * rand(0.88, 1.12) * (kind === 'normal' ? 1 : 0.8),
      typed: 0,
    });
    this.spawned++;
  }

  private pickText(kind: WordKind, weights: number[]): string {
    if (kind === 'clear') return pick(CLEAR_WORDS);
    if (kind === 'slow') return pick(SLOW_WORDS);
    const onScreen = new Set(this.words.map((w) => w.text));
    let text = '';
    for (let tries = 0; tries < 8 && (!text || onScreen.has(text)); tries++) text = pick(TIERS[weightedIndex(weights)]);
    return text;
  }

  /** Try a few slots and keep the one farthest from words still near the top. */
  private placeX(len: number): number {
    const span = (l: number) => l + 2;
    const free = (l: number) => Math.max(1, this.fieldChars - span(l));
    const center = (x: number, l: number) => x * free(l) + span(l) / 2;
    const recent = this.words.filter((w) => w.y < 0.4);
    let best = Math.random();
    let bestGap = -Infinity;
    for (let i = 0; i < 8; i++) {
      const x = Math.random();
      const gap = Math.min(
        Infinity,
        ...recent.map((w) => Math.abs(center(x, len) - center(w.x, w.text.length)) - (span(len) + span(w.text.length)) / 2),
      );
      if (gap > bestGap) {
        best = x;
        bestGap = gap;
      }
    }
    return best;
  }

  /** The word closest to the base line that starts with prefix. */
  private findByPrefix(prefix: string): Word | null {
    const p = lower(prefix);
    let found: Word | null = null;
    for (const w of this.words) if (lower(w.text).startsWith(p) && (!found || w.y > found.y)) found = w;
    return found;
  }

  private miss() {
    this.combo = 0;
    this.missAt = this.time;
    this.emit('miss');
  }

  private remove(w: Word) {
    this.words = this.words.filter((x) => x !== w);
    if (this.target === w) this.target = null;
  }

  private destroy(w: Word, swept = false) {
    this.remove(w);
    if (!swept) {
      this.combo++;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
    }
    const letters = w.text.replace(/\s/g, '').length;
    const points = swept ? letters * 5 : letters * 10 * this.multiplier;
    this.score += points;
    this.bursts.push({ id: this.nextId++, x: w.x, y: w.y, len: w.text.length, points, kind: w.kind, at: this.time });
    if (w.kind === 'clear') {
      for (const other of [...this.words]) this.destroy(other, true);
      this.showBanner('screen cleared', 'every word swept', 1.4);
    } else if (w.kind === 'slow') {
      this.slowUntil = this.time + SLOW_SECONDS;
      this.showBanner('slow time', `${SLOW_SECONDS}s at ${Math.round(SLOW_FACTOR * 100)}% speed`, 1.4);
    }
    if (!swept) this.emit(w.kind === 'normal' ? 'kill' : 'special');
  }

  private breach(w: Word) {
    if (this.over) return;
    this.remove(w);
    this.lives--;
    this.combo = 0;
    this.breachAt = this.time;
    this.emit('breach');
    if (this.lives <= 0) {
      this.over = true;
      this.emit('over');
    }
  }

  private showBanner(title: string, sub: string, seconds: number) {
    this.banner = { id: this.nextId++, title, sub, until: this.time + seconds };
  }
}

function weightedIndex(weights: number[]): number {
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}
