import type { Palette } from '../../games/kit';
import { CHARSETS, DEFAULT_SETTINGS, DENSITY, type RainSettings } from './settings';

/**
 * Canvas digital rain. The screen is a grid of glyph cells; falling drops
 * light up the cells they pass, brightest at the head and fading towards
 * the background. Glyphs are pre-rendered once into a sprite atlas, so a
 * frame is one fill plus a drawImage per lit cell. Every per-frame buffer
 * is a typed array that is reused until the grid size changes.
 */

const FONT_STACK =
  '"JetBrains Mono", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Noto Sans CJK JP", "Yu Gothic", "MS Gothic", ui-monospace, monospace';
const ATLAS_COLS = 16;
const DROPS_PER_COLUMN = 1.1;
const FPS = 30;
const REDUCED_FPS = 12;
/** Cells dimmer than this are skipped. */
const MIN_LIGHT = 0.035;

type Rgb = [number, number, number];

/** Size of one glyph in CSS px for a canvas of this size. */
function glyphSize(cssW: number, cssH: number): number {
  return Math.max(12, Math.min(20, Math.round(Math.min(cssW, cssH * 1.6) / 50)));
}

export class Rain {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly atlas = document.createElement('canvas');
  private readonly atlasCtx: CanvasRenderingContext2D;

  private settings: RainSettings = { ...DEFAULT_SETTINGS };
  private glyphs: readonly string[] = CHARSETS[DEFAULT_SETTINGS.charset].glyphs;
  private colors = { bg: '#000', trail: '#0f0', head: '#fff', glow: 'rgba(0,255,0,0.8)' };
  private reduced = false;

  // geometry, in device pixels unless named css*
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private fontPx = 0;
  private cellW = 0;
  private cellH = 0;
  private pad = 0;
  private spriteW = 0;
  private spriteH = 0;
  private atlasRows = 1;
  private offsetX = 0;
  private cols = 0;
  private rows = 0;

  // one entry per cell
  private cellGlyph = new Uint8Array(0);
  private cellLight = new Float32Array(0);

  // drops, as parallel arrays
  private dropCol = new Uint16Array(0);
  private dropY = new Float32Array(0);
  private dropSpeed = new Float32Array(0);
  private dropLen = new Float32Array(0);
  private active = 0;

  private raf = 0;
  private last = 0;
  private running = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.atlasCtx = this.atlas.getContext('2d')!;
  }

  /* ------------------------------------------------------------ settings */

  setPalette(p: Palette) {
    const probe = this.atlasCtx;
    const bg = toRgb(p.bg1, probe);
    const hl = toRgb(p.hl1, probe);
    const text = toRgb(p.t2, probe);
    const light = luminance(bg) > 0.5;
    this.colors = {
      bg: rgb(bg),
      trail: rgb(hl),
      // a near-white head on dark themes, a deeper accent on light ones
      head: rgb(mix(hl, text, light ? 0.35 : 0.7)),
      glow: `rgba(${hl.join(',')},${light ? 0.35 : 0.85})`,
    };
    this.buildAtlas();
    this.paintIfStill();
  }

  setOptions(next: RainSettings) {
    const prev = this.settings;
    this.settings = next;
    if (next.charset !== prev.charset) {
      this.glyphs = CHARSETS[next.charset].glyphs;
      this.scrambleGlyphs();
      this.buildAtlas();
    }
    if (next.density !== prev.density) this.applyDensity(false);
    this.paintIfStill();
  }

  setReducedMotion(on: boolean) {
    this.reduced = on;
  }

  /** Match the canvas to its box (CSS px). Cheap when nothing changed. */
  resize(cssW: number, cssH: number, force = false) {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    if (!force && cssW === this.cssW && cssH === this.cssH && dpr === this.dpr) return;
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    const width = Math.max(1, Math.round(cssW * dpr));
    const height = Math.max(1, Math.round(cssH * dpr));
    // Exact CSS size, so one backing pixel maps to one device pixel.
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.width = `${width / dpr}px`;
    this.canvas.style.height = `${height / dpr}px`;

    const fontPx = glyphSize(cssW, cssH);
    const cellW = Math.round(fontPx * 0.92 * dpr);
    const cellH = Math.round(fontPx * 1.18 * dpr);
    if (fontPx !== this.fontPx || cellW !== this.cellW || cellH !== this.cellH) {
      this.fontPx = fontPx;
      this.cellW = cellW;
      this.cellH = cellH;
      this.buildAtlas();
    }
    const cols = Math.max(1, Math.floor(width / cellW));
    const rows = Math.max(1, Math.ceil(height / cellH));
    this.offsetX = Math.floor((width - cols * cellW) / 2);
    if (cols !== this.cols || rows !== this.rows) this.layoutGrid(cols, rows);
    this.paint();
  }

  /* ---------------------------------------------------------------- loop */

  play() {
    if (this.running) return;
    this.running = true;
    this.last = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  destroy() {
    this.stop();
    this.atlas.width = this.atlas.height = 0;
  }

  private frame = (t: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const interval = 1000 / (this.reduced ? REDUCED_FPS : FPS);
    if (this.last && t - this.last < interval - 2) return;
    const dt = this.last ? Math.min(0.1, (t - this.last) / 1000) : 1 / FPS;
    this.last = t;
    // moved to a screen with another pixel ratio
    if (Math.min(3, window.devicePixelRatio || 1) !== this.dpr) this.resize(this.cssW, this.cssH, true);
    this.step(dt);
    this.paint();
  };

  private paintIfStill() {
    if (!this.running && this.cols) this.paint();
  }

  /* ---------------------------------------------------------- simulation */

  private layoutGrid(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.cellGlyph = new Uint8Array(cols * rows);
    this.cellLight = new Float32Array(cols * rows);
    this.scrambleGlyphs();

    const capacity = Math.ceil(cols * DROPS_PER_COLUMN * DENSITY.max) + 1;
    if (capacity > this.dropCol.length) {
      this.dropCol = grow(this.dropCol, new Uint16Array(capacity));
      this.dropY = grow(this.dropY, new Float32Array(capacity));
      this.dropSpeed = grow(this.dropSpeed, new Float32Array(capacity));
      this.dropLen = grow(this.dropLen, new Float32Array(capacity));
    }
    // Keep the drops that still fit so resizing does not reshuffle the rain.
    for (let i = 0; i < this.active; i++) if (this.dropCol[i] >= cols) this.seed(i, true);
    this.applyDensity(this.active === 0);
  }

  private applyDensity(initial: boolean) {
    if (!this.cols) return;
    const target = Math.round(this.cols * DROPS_PER_COLUMN * this.settings.density);
    const count = Math.max(1, Math.min(this.dropCol.length, target));
    for (let i = this.active; i < count; i++) this.seed(i, initial);
    this.active = count;
  }

  /** Start drop i: spread over the screen at start-up, else just above the top. */
  private seed(i: number, initial: boolean) {
    const rows = this.rows;
    const len = 6 + Math.random() * Math.min(44, Math.max(6, rows * 0.85));
    this.dropCol[i] = Math.floor(Math.random() * this.cols);
    this.dropLen[i] = len;
    this.dropSpeed[i] = (0.55 + Math.random() * 0.9) * (6 + rows * 0.25);
    this.dropY[i] = initial ? Math.random() * (rows + len) : -Math.random() * rows * 0.6;
  }

  private scrambleGlyphs() {
    const n = this.glyphs.length;
    const cells = this.cellGlyph;
    for (let i = 0; i < cells.length; i++) cells[i] = Math.floor(Math.random() * n);
  }

  private step(dt: number) {
    const factor = this.settings.speed * (this.reduced ? 0.25 : 1);
    const { cols, rows, dropY, dropSpeed, dropLen, dropCol, cellGlyph } = this;
    const glyphCount = this.glyphs.length;
    for (let i = 0; i < this.active; i++) {
      const before = Math.floor(dropY[i]);
      const y = dropY[i] + dropSpeed[i] * factor * dt;
      dropY[i] = y;
      const head = Math.floor(y);
      // the head flickers through glyphs as it enters each new cell
      if (head !== before && head >= 0 && head < rows) cellGlyph[head * cols + dropCol[i]] = Math.floor(Math.random() * glyphCount);
      if (y - dropLen[i] > rows) this.seed(i, false);
    }
    // a few random glyphs mutate every frame
    let flips = Math.ceil(cellGlyph.length * (this.reduced ? 0.0008 : 0.003));
    while (flips-- > 0) cellGlyph[Math.floor(Math.random() * cellGlyph.length)] = Math.floor(Math.random() * glyphCount);
  }

  /* ------------------------------------------------------------- drawing */

  private paint() {
    const { ctx, canvas, cols, rows, cellW, cellH, pad, spriteW, offsetX, cellGlyph, cellLight } = this;
    if (!cols || !spriteW) return;
    cellLight.fill(0);
    for (let i = 0; i < this.active; i++) {
      const col = this.dropCol[i];
      if (col >= cols) continue;
      const top = Math.floor(this.dropY[i]);
      const len = this.dropLen[i];
      // k = 0 is the head, drawn separately below
      for (let k = Math.max(1, top - rows + 1); k < len; k++) {
        const r = top - k;
        if (r < 0) break;
        const idx = r * cols + col;
        const light = 0.95 * Math.pow(1 - k / len, 1.15);
        if (light > cellLight[idx]) cellLight[idx] = light;
      }
    }

    ctx.globalAlpha = 1;
    ctx.fillStyle = this.colors.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let r = 0; r < rows; r++) {
      const y = r * cellH - pad;
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const light = cellLight[idx];
        if (light < MIN_LIGHT) continue;
        ctx.globalAlpha = light;
        this.blit(cellGlyph[idx], false, offsetX + c * cellW - pad, y);
      }
    }
    // heads last, so their glow sits on top of neighbouring trails
    ctx.globalAlpha = 1;
    for (let i = 0; i < this.active; i++) {
      const r = Math.floor(this.dropY[i]);
      const c = this.dropCol[i];
      if (r < 0 || r >= rows || c >= cols) continue;
      this.blit(cellGlyph[r * cols + c], true, offsetX + c * cellW - pad, r * cellH - pad);
    }
  }

  private blit(glyph: number, head: boolean, x: number, y: number) {
    const { spriteW, spriteH } = this;
    const sx = (glyph % ATLAS_COLS) * spriteW;
    const sy = (Math.floor(glyph / ATLAS_COLS) + (head ? this.atlasRows : 0)) * spriteH;
    this.ctx.drawImage(this.atlas, sx, sy, spriteW, spriteH, x, y, spriteW, spriteH);
  }

  /** Render every glyph twice (trail colour, then glowing head colour) into the atlas. */
  private buildAtlas() {
    if (!this.cellW) return;
    const { glyphs, cellW, cellH } = this;
    const pad = Math.ceil(cellH * 0.35);
    const spriteW = cellW + pad * 2;
    const spriteH = cellH + pad * 2;
    const rowsPerColour = Math.ceil(glyphs.length / ATLAS_COLS);
    this.pad = pad;
    this.spriteW = spriteW;
    this.spriteH = spriteH;
    this.atlasRows = rowsPerColour;
    this.atlas.width = spriteW * Math.min(ATLAS_COLS, glyphs.length);
    this.atlas.height = spriteH * rowsPerColour * 2;

    const a = this.atlasCtx;
    a.font = `600 ${Math.round(this.fontPx * this.dpr)}px ${FONT_STACK}`;
    a.textAlign = 'center';
    a.textBaseline = 'middle';
    for (let pass = 0; pass < 2; pass++) {
      const head = pass === 1;
      a.fillStyle = head ? this.colors.head : this.colors.trail;
      a.shadowColor = head ? this.colors.glow : 'transparent';
      a.shadowBlur = head ? pad * 0.9 : 0;
      glyphs.forEach((g, i) => {
        const x = (i % ATLAS_COLS) * spriteW + pad + cellW / 2;
        const y = (Math.floor(i / ATLAS_COLS) + pass * rowsPerColour) * spriteH + pad + cellH / 2;
        a.fillText(g, x, y);
      });
    }
    a.shadowBlur = 0;
  }
}

/* ---------------------------------------------------------------- colour */

/** Any CSS colour the canvas understands, as rgb. */
function toRgb(color: string, probe: CanvasRenderingContext2D): Rgb {
  probe.fillStyle = '#000';
  probe.fillStyle = color;
  const v = String(probe.fillStyle);
  if (v.startsWith('#')) {
    const n = parseInt(v.slice(1, 7), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = v.match(/[\d.]+/g);
  return m ? [+m[0], +m[1], +m[2]] : [255, 255, 255];
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as Rgb;
const rgb = (c: Rgb) => `rgb(${c.join(',')})`;
const luminance = ([r, g, b]: Rgb) => (r * 0.299 + g * 0.587 + b * 0.114) / 255;

function grow<T extends Uint16Array | Float32Array>(from: T, to: T): T {
  to.set(from);
  return to;
}
