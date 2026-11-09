import { S_PATH } from '../../core/favicon';
import type { SaverId } from '../../core/screensaver';
import { mix, type Palette } from '../../games/kit';
import { Rain } from '../../widgets/matrix/rain';

/**
 * The screensavers. Each one draws on a full-screen canvas with nothing but
 * the theme's five colours (and blends of them), and takes a new palette
 * live when the theme changes.
 */
export interface Running {
  resize(w: number, h: number): void;
  setPalette(p: Palette): void;
  stop(): void;
}

type Start = (canvas: HTMLCanvasElement, p: Palette, reduced: boolean) => Running;

/** A requestAnimationFrame loop with the frame time in seconds (capped after a pause). */
function loop(frame: (dt: number) => void): () => void {
  let raf = 0;
  let last = 0;
  const tick = (t: number) => {
    raf = requestAnimationFrame(tick);
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
    last = t;
    frame(dt);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

/** A 2D context sized to the screen in CSS pixels, sharp on HiDPI. */
function context(canvas: HTMLCanvasElement, w: number, h: number) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/** Accent, text and their blends: the colours a saver may use for "colourful" things. */
const shades = (p: Palette) => [p.hl1, p.t2, mix(p.hl1, p.t2, 0.5), p.t1, mix(p.hl1, p.bg2, 0.4), mix(p.t2, p.t1, 0.5)];

/* -------------------------------------------------------------- matrix */

const matrix: Start = (canvas, p, reduced) => {
  const rain = new Rain(canvas);
  rain.setReducedMotion(reduced);
  rain.setPalette(p);
  rain.resize(window.innerWidth, window.innerHeight);
  rain.play();
  return {
    resize: (w, h) => rain.resize(w, h),
    setPalette: (q) => rain.setPalette(q),
    stop: () => rain.destroy(),
  };
};

/* --------------------------------------------------------------- stars */

const stars: Start = (canvas, p, reduced) => {
  let pal = p;
  let w = window.innerWidth;
  let h = window.innerHeight;
  let ctx = context(canvas, w, h);
  const N = 520;
  const sx = new Float32Array(N);
  const sy = new Float32Array(N);
  const sz = new Float32Array(N);
  const pz = new Float32Array(N);
  const seed = (i: number, far: boolean) => {
    sx[i] = (Math.random() - 0.5) * 2;
    sy[i] = (Math.random() - 0.5) * 2;
    sz[i] = far ? 1 : Math.random() * 0.95 + 0.05;
    pz[i] = sz[i];
  };
  for (let i = 0; i < N; i++) seed(i, false);
  const speed = reduced ? 0.06 : 0.28;
  const stop = loop((dt) => {
    // a translucent background leaves short trails
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = pal.bg1;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    const cx = w / 2;
    const cy = h / 2;
    const scale = Math.max(w, h) * 0.6;
    for (let i = 0; i < N; i++) {
      pz[i] = sz[i];
      sz[i] -= speed * dt;
      if (sz[i] <= 0.02) {
        seed(i, true);
        continue;
      }
      const x = cx + (sx[i] / sz[i]) * scale * 0.5;
      const y = cy + (sy[i] / sz[i]) * scale * 0.5;
      const px = cx + (sx[i] / pz[i]) * scale * 0.5;
      const py = cy + (sy[i] / pz[i]) * scale * 0.5;
      if (x < 0 || x > w || y < 0 || y > h) {
        seed(i, true);
        continue;
      }
      const near = 1 - sz[i];
      ctx.strokeStyle = near > 0.75 ? pal.hl1 : near > 0.4 ? pal.t2 : pal.t1;
      ctx.lineWidth = 0.6 + near * 2.4;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  });
  return {
    resize: (nw, nh) => {
      w = nw;
      h = nh;
      ctx = context(canvas, w, h);
    },
    setPalette: (q) => (pal = q),
    stop,
  };
};

/* --------------------------------------------------------------- pipes */

const pipes: Start = (canvas, p, reduced) => {
  let pal = p;
  let w = window.innerWidth;
  let h = window.innerHeight;
  let ctx = context(canvas, w, h);
  const CELL = 26;
  const DIRS = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  interface Pipe {
    x: number;
    y: number;
    dir: number;
    color: string;
    steps: number;
  }
  let cols = 0;
  let rows = 0;
  let filled = 0;
  let list: Pipe[] = [];

  const newPipe = (): Pipe => {
    const c = shades(pal);
    return { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows), dir: Math.floor(Math.random() * 4), color: c[Math.floor(Math.random() * c.length)], steps: 0 };
  };
  const reset = () => {
    cols = Math.ceil(w / CELL);
    rows = Math.ceil(h / CELL);
    filled = 0;
    ctx.fillStyle = pal.bg1;
    ctx.fillRect(0, 0, w, h);
    list = Array.from({ length: 4 }, newPipe);
  };
  reset();

  const center = (v: number) => v * CELL + CELL / 2;
  let acc = 0;
  const stepEvery = reduced ? 0.12 : 0.025;
  const stop = loop((dt) => {
    acc += dt;
    while (acc >= stepEvery) {
      acc -= stepEvery;
      for (const pipe of list) {
        // turn now and then, and away from the edges
        if (Math.random() < 0.18) pipe.dir = (pipe.dir + (Math.random() < 0.5 ? 1 : 3)) % 4;
        let [dx, dy] = DIRS[pipe.dir];
        if (pipe.x + dx < 0 || pipe.x + dx >= cols || pipe.y + dy < 0 || pipe.y + dy >= rows) {
          pipe.dir = (pipe.dir + 2) % 4;
          [dx, dy] = DIRS[pipe.dir];
        }
        const nx = pipe.x + dx;
        const ny = pipe.y + dy;
        ctx.strokeStyle = pipe.color;
        ctx.lineCap = 'round';
        ctx.lineWidth = CELL * 0.42;
        ctx.beginPath();
        ctx.moveTo(center(pipe.x), center(pipe.y));
        ctx.lineTo(center(nx), center(ny));
        ctx.stroke();
        // a highlight down the middle gives the pipe some depth
        ctx.strokeStyle = mix(pipe.color, pal.t2, 0.45);
        ctx.lineWidth = CELL * 0.1;
        ctx.beginPath();
        ctx.moveTo(center(pipe.x), center(pipe.y) - CELL * 0.08);
        ctx.lineTo(center(nx), center(ny) - CELL * 0.08);
        ctx.stroke();
        pipe.x = nx;
        pipe.y = ny;
        pipe.steps++;
        filled++;
        if (pipe.steps > 60 + Math.random() * 120) Object.assign(pipe, newPipe());
      }
      if (filled > cols * rows * 1.4) reset();
    }
  });
  return {
    resize: (nw, nh) => {
      w = nw;
      h = nh;
      ctx = context(canvas, w, h);
      reset();
    },
    setPalette: (q) => {
      pal = q;
      reset();
    },
    stop,
  };
};

/* -------------------------------------------------------------- bounce */

const bounce: Start = (canvas, p, reduced) => {
  let pal = p;
  let w = window.innerWidth;
  let h = window.innerHeight;
  let ctx = context(canvas, w, h);
  const S = new Path2D(S_PATH);
  const size = () => Math.max(90, Math.min(180, Math.min(w, h) * 0.22));
  let x = Math.random() * (w - size());
  let y = Math.random() * (h - size());
  const speed = reduced ? 60 : 150;
  let vx = speed;
  let vy = speed * 0.8;
  let shade = 0;
  const stop = loop((dt) => {
    const s = size();
    x += vx * dt;
    y += vy * dt;
    let hit = false;
    if (x <= 0 || x + s >= w) {
      vx = -vx;
      x = Math.max(0, Math.min(x, w - s));
      hit = true;
    }
    if (y <= 0 || y + s >= h) {
      vy = -vy;
      y = Math.max(0, Math.min(y, h - s));
      hit = true;
    }
    if (hit) shade = (shade + 1) % shades(pal).length;
    const color = shades(pal)[shade];
    ctx.fillStyle = pal.bg1;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s / 64, s / 64);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(32, 32, 29, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 3.2;
    ctx.stroke(S);
    ctx.restore();
  });
  return {
    resize: (nw, nh) => {
      w = nw;
      h = nh;
      ctx = context(canvas, w, h);
    },
    setPalette: (q) => (pal = q),
    stop,
  };
};

export const START: Record<SaverId, Start> = { matrix, stars, pipes, bounce };
