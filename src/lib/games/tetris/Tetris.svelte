<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { GameApi } from '../../core/types';
  import { fitCanvas, heldKeys, mix, readPalette, startLoop, watchPalette, type Palette } from '../kit';

  export let paused = true;
  export let api: GameApi;

  const W = 10;
  const H = 20;
  const C = 10; // virtual cell size
  const VW = W * C + 76;
  const VH = H * C + 4;

  type Kind = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
  const SHAPES: Record<Kind, string[]> = {
    I: ['....', '####', '....', '....'],
    O: ['##', '##'],
    T: ['.#.', '###', '...'],
    S: ['.##', '##.', '...'],
    Z: ['##.', '.##', '...'],
    J: ['#..', '###', '...'],
    L: ['..#', '###', '...'],
  };
  // The seven pieces are shades of the theme's accent and text colours.
  const pieceColors = (p: Palette): Record<Kind, string> => ({
    I: p.hl1,
    O: p.t2,
    T: mix(p.hl1, p.t2, 0.5),
    S: p.t1,
    Z: mix(p.hl1, p.t1, 0.5),
    J: mix(p.t2, p.t1, 0.5),
    L: mix(p.hl1, p.bg2, 0.4),
  });
  let colors = {} as Record<Kind, string>;

  // rotations[kind][r] = list of [x, y] cells
  const ROT: Record<Kind, [number, number][][]> = {} as never;
  for (const k of Object.keys(SHAPES) as Kind[]) {
    let m = SHAPES[k].map((r) => r.split('').map((c) => c === '#'));
    const list: [number, number][][] = [];
    for (let r = 0; r < 4; r++) {
      const cells: [number, number][] = [];
      m.forEach((row, y) => row.forEach((on, x) => on && cells.push([x, y])));
      list.push(cells);
      const n = m.length;
      m = m.map((_, y) => m.map((__, x) => m[n - 1 - x][y]));
    }
    ROT[k] = list;
  }

  // SRS wall kicks, y pointing down. Key: from*4+to.
  const K_JLSTZ: Record<string, [number, number][]> = {
    '01': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '10': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '12': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '21': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '23': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '32': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '30': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '03': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  };
  const K_I: Record<string, [number, number][]> = {
    '01': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
    '10': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
    '12': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
    '21': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
    '23': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
    '32': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
    '30': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
    '03': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  };

  let board: (Kind | null)[][] = Array.from({ length: H }, () => Array(W).fill(null));
  let bag: Kind[] = [];
  const queue: Kind[] = [];
  function fromBag(): Kind {
    if (!bag.length) {
      bag = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop()!;
  }
  while (queue.length < 4) queue.push(fromBag());

  let piece = { k: 'T' as Kind, r: 0, x: 3, y: 0 };
  let hold: Kind | null = null;
  let holdUsed = false;
  let score = 0;
  let lines = 0;
  let level = 1;
  let over = false;
  let gravityAcc = 0;
  let lockTimer = 0;
  let lockResets = 0;
  let clearing: number[] = [];
  let clearTimer = 0;

  const cells = (p = piece) => ROT[p.k][p.r].map(([cx, cy]) => [p.x + cx, p.y + cy] as [number, number]);
  const fits = (p: typeof piece) =>
    cells(p).every(([x, y]) => x >= 0 && x < W && y < H && (y < 0 || !board[y][x]));
  const grounded = () => !fits({ ...piece, y: piece.y + 1 });

  function spawn(k: Kind = queue.shift()!) {
    queue.push(fromBag());
    piece = { k, r: 0, x: k === 'O' ? 4 : 3, y: k === 'I' ? -1 : 0 };
    lockTimer = 0;
    lockResets = 0;
    gravityAcc = 0;
    if (!fits(piece)) {
      over = true;
      api.gameOver(score, `${lines} lines · level ${level}`);
    }
  }

  function touched() {
    if (grounded() && lockResets < 15) {
      lockTimer = 0;
      lockResets++;
    }
  }

  function move(dx: number) {
    const p = { ...piece, x: piece.x + dx };
    if (fits(p)) {
      piece = p;
      touched();
      return true;
    }
    return false;
  }

  function rotate(dir: 1 | -1) {
    if (piece.k === 'O') return;
    const to = (piece.r + dir + 4) % 4;
    const table = piece.k === 'I' ? K_I : K_JLSTZ;
    for (const [kx, ky] of table[`${piece.r}${to}`]) {
      const p = { ...piece, r: to, x: piece.x + kx, y: piece.y + ky };
      if (fits(p)) {
        piece = p;
        touched();
        api.sfx('blip');
        return;
      }
    }
  }

  function lock() {
    for (const [x, y] of cells()) {
      if (y < 0) {
        over = true;
        api.gameOver(score, `${lines} lines · level ${level}`);
        return;
      }
      board[y][x] = piece.k;
    }
    holdUsed = false;
    const full = board.map((row, y) => (row.every(Boolean) ? y : -1)).filter((y) => y >= 0);
    if (full.length) {
      clearing = full;
      clearTimer = 0.18;
      score += [0, 100, 300, 500, 800][full.length] * level;
      lines += full.length;
      level = 1 + Math.floor(lines / 10);
      api.setScore(score);
      api.sfx(full.length === 4 ? 'win' : 'score');
    } else {
      api.sfx('hit');
      spawn();
    }
  }

  function hardDrop() {
    let d = 0;
    while (fits({ ...piece, y: piece.y + 1 })) {
      piece.y++;
      d++;
    }
    score += d * 2;
    api.setScore(score);
    lock();
  }

  function doHold() {
    if (holdUsed) return;
    const k = piece.k;
    if (hold) spawn(hold);
    else spawn();
    hold = k;
    holdUsed = true;
  }

  // delayed auto shift / auto repeat for left and right
  const DAS = 0.16;
  const ARR = 0.045;
  let dasDir = 0;
  let dasT = 0;

  const keys = heldKeys(api, (k, e) => {
    if (over || clearing.length) return;
    if (k === 'left' || k === 'right') {
      dasDir = k === 'left' ? -1 : 1;
      dasT = 0;
      move(dasDir);
    } else if (k === 'up' || k === 'KeyX') rotate(1);
    else if (k === 'KeyQ' || k === 'KeyZ') rotate(-1);
    else if (k === 'KeyE' || k === 'Enter') {
      e.preventDefault();
      hardDrop();
    } else if (k === 'KeyC' || k === 'ShiftLeft' || k === 'ShiftRight') doHold();
  });

  function gravityDelay() {
    return Math.pow(0.8 - (level - 1) * 0.007, level - 1);
  }

  function update(dt: number) {
    if (over) return;
    if (clearing.length) {
      clearTimer -= dt;
      if (clearTimer <= 0) {
        board = board.filter((_, y) => !clearing.includes(y));
        while (board.length < H) board.unshift(Array(W).fill(null));
        clearing = [];
        spawn();
      }
      return;
    }
    // horizontal auto repeat
    const dir = keys.has('left') && !keys.has('right') ? -1 : keys.has('right') && !keys.has('left') ? 1 : 0;
    if (dir !== dasDir) {
      dasDir = dir;
      dasT = 0;
    } else if (dir) {
      dasT += dt;
      while (dasT >= DAS + ARR) {
        dasT -= ARR;
        if (!move(dir)) break;
      }
    }
    // gravity (soft drop is 20x faster)
    const soft = keys.has('down');
    gravityAcc += dt;
    const delay = soft ? Math.min(0.05, gravityDelay() / 20) : gravityDelay();
    while (gravityAcc >= delay) {
      gravityAcc -= delay;
      if (fits({ ...piece, y: piece.y + 1 })) {
        piece.y++;
        if (soft) {
          score += 1;
          api.setScore(score);
        }
      } else break;
    }
    if (grounded()) {
      lockTimer += dt;
      if (lockTimer >= 0.5) lock();
    } else lockTimer = 0;
  }

  /* ------------------------------------------------------------ drawing */

  let canvas: HTMLCanvasElement;
  let box: HTMLDivElement;
  let w = 0;
  let h = 0;
  let ctx: CanvasRenderingContext2D | null = null;
  let pal: Palette;
  $: if (pal) colors = pieceColors(pal);
  $: if (canvas && w && h) ctx = fitCanvas(canvas, w, h, VW, VH);
  $: if (paused) keys.clear();

  function block(x: number, y: number, color: string, alpha = 1) {
    if (!ctx) return;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(x + 0.5, y + 0.5, C - 1, C - 1);
    ctx.globalAlpha = alpha * 0.35;
    ctx.fillStyle = pal.t2;
    ctx.fillRect(x + 0.5, y + 0.5, C - 1, 1.5);
    ctx.globalAlpha = 1;
  }

  function mini(k: Kind | null, x: number, y: number, dim = false) {
    if (!k) return;
    const s = 6;
    for (const [cx, cy] of ROT[k][0]) {
      ctx!.globalAlpha = dim ? 0.35 : 1;
      ctx!.fillStyle = colors[k];
      ctx!.fillRect(x + cx * s, y + cy * s, s - 0.8, s - 0.8);
    }
    ctx!.globalAlpha = 1;
  }

  function draw() {
    if (!ctx || !pal) return;
    const ox = 2;
    const oy = 2;
    ctx.fillStyle = pal.bg1;
    ctx.fillRect(0, 0, VW, VH);
    ctx.fillStyle = pal.bg2;
    ctx.globalAlpha = 0.25;
    ctx.fillRect(ox, oy, W * C, H * C);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = pal.bg2;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(ox, oy, W * C, H * C);
    board.forEach((row, y) =>
      row.forEach((k, x) => {
        if (k) block(ox + x * C, oy + y * C, colors[k], clearing.includes(y) ? 0.3 + Math.random() * 0.7 : 1);
      }),
    );
    if (!over && !clearing.length) {
      // ghost
      const g = { ...piece };
      while (fits({ ...g, y: g.y + 1 })) g.y++;
      for (const [x, y] of cells(g)) if (y >= 0) {
        ctx.strokeStyle = colors[piece.k];
        ctx.globalAlpha = 0.5;
        ctx.strokeRect(ox + x * C + 1, oy + y * C + 1, C - 2, C - 2);
        ctx.globalAlpha = 1;
      }
      for (const [x, y] of cells()) if (y >= 0) block(ox + x * C, oy + y * C, colors[piece.k]);
    }
    // side panel
    const px = ox + W * C + 8;
    ctx.fillStyle = pal.t1;
    ctx.font = '6px "JetBrains Mono", monospace';
    ctx.fillText('NEXT', px, 10);
    queue.slice(0, 3).forEach((k, i) => mini(k, px, 15 + i * 18));
    ctx.fillStyle = pal.t1;
    ctx.fillText('HOLD', px, 80);
    mini(hold, px, 85, holdUsed);
    const stat = (label: string, v: string | number, y: number) => {
      ctx!.fillStyle = pal.t1;
      ctx!.fillText(label, px, y);
      ctx!.fillStyle = pal.t2;
      ctx!.font = 'bold 9px "JetBrains Mono", monospace';
      ctx!.fillText(String(v), px, y + 10);
      ctx!.font = '6px "JetBrains Mono", monospace';
    };
    stat('SCORE', score, 120);
    stat('LINES', lines, 145);
    stat('LEVEL', level, 170);
  }

  let stopLoop: () => void;
  let stopPal: () => void;
  onMount(() => {
    spawn();
    stopPal = watchPalette(box, (p) => (pal = p));
    pal = readPalette(box);
    stopLoop = startLoop(update, draw, () => paused || over);
  });
  onDestroy(() => {
    stopLoop?.();
    stopPal?.();
    keys.stop();
  });
</script>

<div class="box" bind:this={box} bind:clientWidth={w} bind:clientHeight={h}>
  <canvas bind:this={canvas} />
</div>

<style>
  .box {
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    overflow: hidden;
  }
</style>
