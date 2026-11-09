<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { fade } from 'svelte/transition';
  import { saverPrefs, screensaverRequest, startScreensaver, type SaverRequest } from '../../core/screensaver';
  import { themeStore } from '../../core/theme';
  import { readPalette } from '../../games/kit';
  import { START, type Running } from './savers';

  let active: SaverRequest | null = null;
  let canvas: HTMLCanvasElement;
  let running: Running | null = null;
  let startedAt = 0;
  let startPoint: { x: number; y: number } | null = null;
  let typed: string[] = [];
  let typer: ReturnType<typeof setInterval> | undefined;
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const offRequest = screensaverRequest.subscribe((req) => {
    if (!req) return;
    screensaverRequest.set(null);
    show(req);
  });

  async function show(req: SaverRequest) {
    stopSaver();
    active = req;
    startedAt = Date.now();
    startPoint = null;
    await tick();
    if (!canvas) return;
    running = START[req.id](canvas, readPalette(document.documentElement), reduced);
    typeOut(req.message ?? []);
  }

  /** The hack message, one character at a time. */
  function typeOut(lines: string[]) {
    typed = lines.map(() => '');
    if (!lines.length) return;
    let line = 0;
    let char = 0;
    typer = setInterval(
      () => {
        if (line >= lines.length) return clearInterval(typer);
        char++;
        typed[line] = lines[line].slice(0, char);
        typed = typed;
        if (char >= lines[line].length) {
          line++;
          char = 0;
        }
      },
      reduced ? 10 : 45,
    );
  }

  function stopSaver() {
    if (typer) clearInterval(typer);
    running?.stop();
    running = null;
  }

  function exit() {
    stopSaver();
    active = null;
    lastActivity = Date.now();
  }

  // Any key, click, touch or wheel returns; a little mouse jitter does not.
  // The first moment is ignored so the key or click that started it does not end it.
  const GRACE = 700;
  function onInput(e: Event) {
    lastActivity = Date.now();
    if (!active) return;
    if (e.type === 'keydown') {
      e.preventDefault();
      e.stopPropagation();
    }
    if (Date.now() - startedAt < GRACE) return;
    if (e.type === 'pointermove') {
      const p = e as PointerEvent;
      if (!startPoint) startPoint = { x: p.clientX, y: p.clientY };
      if (Math.hypot(p.clientX - startPoint.x, p.clientY - startPoint.y) < 30) return;
    }
    exit();
  }

  function onResize() {
    running?.resize(window.innerWidth, window.innerHeight);
  }

  // Follow the theme while running.
  const offTheme = themeStore.subscribe(() =>
    requestAnimationFrame(() => running?.setPalette(readPalette(document.documentElement))),
  );

  /* ---------------------------------------------------------------- idle */

  let lastActivity = Date.now();
  let idleTimer: ReturnType<typeof setInterval> | undefined;
  onMount(() => {
    const events = ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart'];
    for (const ev of events) window.addEventListener(ev, onInput, { capture: true, passive: ev !== 'keydown' });
    window.addEventListener('resize', onResize);
    idleTimer = setInterval(() => {
      const minutes = $saverPrefs.idleMinutes;
      if (!active && minutes > 0 && !document.hidden && Date.now() - lastActivity >= minutes * 60_000) startScreensaver();
    }, 10_000);
    return () => {
      for (const ev of events) window.removeEventListener(ev, onInput, { capture: true });
      window.removeEventListener('resize', onResize);
      if (idleTimer) clearInterval(idleTimer);
    };
  });

  onDestroy(() => {
    offRequest();
    offTheme();
    stopSaver();
  });
</script>

{#if active}
  <div class="saver" transition:fade={{ duration: reduced ? 0 : 400 }} role="presentation" aria-label="Screensaver: press any key to return">
    <canvas bind:this={canvas} />
    {#if typed.length}
      <div class="message" aria-live="polite">
        {#each typed as line, i}
          <p class:big={i === typed.length - 1}>{line}<span class="caret" class:on={line.length < (active.message?.[i]?.length ?? 0) || i === typed.length - 1} /></p>
        {/each}
      </div>
    {/if}
    <p class="hint">press any key to return</p>
  </div>
{/if}

<style>
  .saver {
    position: fixed;
    inset: 0;
    z-index: 400;
    background: var(--bg1);
    cursor: none;
  }
  canvas {
    position: absolute;
    inset: 0;
    display: block;
  }
  .message {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(640px, calc(100vw - 32px));
    padding: 18px 22px;
    border: 1px solid color-mix(in srgb, var(--hl1) 55%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--bg1) 82%, transparent);
    color: var(--hl1);
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 14px;
    line-height: 1.6;
    box-shadow: 0 0 40px -10px var(--hl1);
  }
  .message p {
    margin: 0;
    min-height: 1.6em;
    white-space: pre-wrap;
  }
  .message p.big {
    margin-top: 6px;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--t2);
    text-shadow: 0 0 14px var(--hl1);
  }
  .caret {
    display: inline-block;
    width: 0.55em;
    height: 1em;
    margin-left: 2px;
    vertical-align: -0.12em;
    background: var(--hl1);
    opacity: 0;
  }
  .caret.on {
    animation: blink 1s steps(1) infinite;
  }
  @keyframes blink {
    0%,
    50% {
      opacity: 1;
    }
    51%,
    100% {
      opacity: 0;
    }
  }
  .hint {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 18px;
    margin: 0;
    text-align: center;
    color: var(--t1);
    font-size: 11px;
    letter-spacing: 0.1em;
    animation: hint 4s ease forwards;
  }
  @keyframes hint {
    0%,
    60% {
      opacity: 0.8;
    }
    100% {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .caret.on,
    .hint {
      animation: none;
    }
  }
</style>
