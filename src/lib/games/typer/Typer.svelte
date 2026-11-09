<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { sfx as playSfx, tone } from '../../core/sound';
  import type { GameApi } from '../../core/types';
  import { clamp, startLoop } from '../kit';
  import { TyperRun, type TyperEvent, type Word } from './engine';

  export let paused = true;
  export let api: GameApi;

  let game = new TyperRun(onEvent);
  let dirty = true;

  function onEvent(e: TyperEvent) {
    dirty = true;
    if (e === 'key') playSfx('key');
    else if (e === 'miss') tone(170, 70, 'square', 0.025);
    else if (e === 'breach') api.sfx('hit');
    else if (e === 'over') finish();
    else {
      api.setScore(game.score);
      api.sfx(e === 'kill' ? 'blip' : 'score');
    }
  }

  function finish() {
    api.gameOver(game.score, game.summary());
    // Close the soft keyboard and hand keys back to the shell (Enter restarts).
    if (typing) (fieldEl?.closest('[tabindex="0"]') as HTMLElement | null)?.focus({ preventScroll: true });
  }

  /* ---------------------------------------------------------- physical keys */

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      game.backspace();
    } else if (e.key.length === 1) {
      // Printable characters are matched on e.key (layout aware); Alt combos never reach here.
      e.preventDefault();
      game.typeChar(e.key);
    } else return;
    dirty = true;
  }

  /* -------------------------------------------- soft keyboard (touch screens) */

  // GameShell ignores keydown from inputs, so the hidden input is read through
  // its own input events. A sentinel keeps Backspace working on an empty field.
  const SENTINEL = '__';
  let input: HTMLInputElement;
  let last = SENTINEL;
  let typing = false;
  let resumeTyping = false;
  let coarse = false;
  let pointerType = '';
  $: touchUi = coarse || pointerType === 'touch';

  function resetInput() {
    if (!input) return;
    input.value = SENTINEL;
    last = SENTINEL;
    input.setSelectionRange(SENTINEL.length, SENTINEL.length);
  }

  function onInput(e: Event) {
    const value = input.value;
    if (!paused) applyDiff(last, value);
    last = value;
    if (!(e as InputEvent).isComposing) resetInput();
  }

  /** Replay what changed in the field as backspaces and typed characters. */
  function applyDiff(before: string, after: string) {
    let p = 0;
    while (p < before.length && p < after.length && before[p] === after[p]) p++;
    for (let i = p; i < before.length; i++) game.backspace();
    for (const ch of after.slice(p)) game.typeChar(ch);
    dirty = true;
  }

  function onInputKey(e: KeyboardEvent) {
    if (e.key === 'Enter') e.preventDefault();
    if (e.key !== 'Escape') return;
    // Re-send Escape from a non-input element so the shell pauses as usual.
    e.preventDefault();
    fieldEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
  }

  function openKeyboard() {
    if (touchUi && !game.over) input?.focus();
  }

  function onInputFocus() {
    typing = true;
    resetInput();
    watchViewport(true);
  }

  function onInputBlur() {
    typing = false;
    watchViewport(false);
  }

  // Pausing with Escape keeps the keyboard up; bring typing back on resume.
  $: if (paused && typing) resumeTyping = true;
  $: if (!paused && resumeTyping) {
    resumeTyping = false;
    if (!typing) input?.focus({ preventScroll: true });
  }

  /* ------------------------------------- keep the base line above the keyboard */

  const MIN_FIELD = 90;
  let rootEl: HTMLDivElement;
  let padTop = 0;
  let padBottom = 0;
  let measureRaf = 0;

  // Shrink the field to the part of the pane the visual viewport still shows.
  function measureViewport() {
    measureRaf = 0;
    const vv = window.visualViewport;
    if (!typing || !vv || !rootEl) {
      padTop = padBottom = 0;
      return;
    }
    const r = rootEl.getBoundingClientRect();
    const room = Math.max(0, r.height - MIN_FIELD - hudH);
    padBottom = Math.min(Math.max(0, r.bottom - (vv.offsetTop + vv.height)), room);
    padTop = Math.min(Math.max(0, vv.offsetTop - r.top), room - padBottom);
  }

  function scheduleMeasure() {
    if (!measureRaf) measureRaf = requestAnimationFrame(measureViewport);
  }

  function watchViewport(on: boolean) {
    const vv = window.visualViewport;
    if (on) {
      vv?.addEventListener('resize', scheduleMeasure);
      vv?.addEventListener('scroll', scheduleMeasure);
      window.addEventListener('scroll', scheduleMeasure, { capture: true, passive: true });
    } else {
      vv?.removeEventListener('resize', scheduleMeasure);
      vv?.removeEventListener('scroll', scheduleMeasure);
      window.removeEventListener('scroll', scheduleMeasure, { capture: true });
    }
    scheduleMeasure();
  }

  /* ------------------------------------------------------------------ layout */

  let fieldEl: HTMLDivElement;
  let boxW = 0;
  let boxH = 0;
  let fieldW = 0;
  let fieldH = 0;
  let hudH = 0;
  let probeW = 0;
  $: fontPx = clamp(Math.round(Math.min(fieldW / 30, fieldH / 9)), 12, 20);
  $: chPx = probeW ? probeW / 10 : fontPx * 0.6;
  $: if (fieldW && chPx) game.fieldChars = fieldW / chPx;
  $: compact = boxH > 0 && (boxH < 260 || boxW < 380);
  $: tiny = boxW > 0 && boxW < 270;

  const SPARKS = Array.from({ length: 10 }, (_, i) => i * 36);
  const HEART = 'M8 14.2S1.3 10 1.3 5.6A3.3 3.3 0 0 1 8 4a3.3 3.3 0 0 1 6.7 1.6C14.7 10 8 14.2 8 14.2z';

  const leftOf = (x: number, len: number) => `calc((100% - ${len + 2}ch) * ${x})`;
  const centerOf = (x: number, len: number) => `calc((100% - ${len + 2}ch) * ${x} + ${(len + 1) / 2}ch + 1px)`;
  const centerPx = (w: Word) => (fieldW - (w.text.length + 2) * chPx) * w.x + ((w.text.length + 1) * chPx) / 2;

  $: target = game.target;
  $: placeholder = touchUi && !typing ? 'tap the board to type' : game.words.length ? 'type a word' : '';

  /* -------------------------------------------------------------------- loop */

  let stopLoop: () => void = () => {};
  let offKey: () => void = () => {};
  let mq: MediaQueryList | null = null;
  const onMq = () => (coarse = !!mq?.matches);

  onMount(() => {
    mq = window.matchMedia('(hover: none) and (pointer: coarse)');
    onMq();
    mq.addEventListener('change', onMq);
    offKey = api.onKeyDown(onKey);
    stopLoop = startLoop(
      (dt) => {
        game.update(dt);
        dirty = true;
      },
      () => {
        if (!dirty) return;
        dirty = false;
        game = game;
      },
      () => paused || game.over,
    );
  });

  onDestroy(() => {
    stopLoop();
    offKey();
    mq?.removeEventListener('change', onMq);
    if (typeof window !== 'undefined') watchViewport(false);
    if (measureRaf) cancelAnimationFrame(measureRaf);
  });
</script>

<div class="typer" bind:this={rootEl} bind:clientWidth={boxW} bind:clientHeight={boxH} style="padding-top: {padTop}px; padding-bottom: {padBottom}px">
  <!-- Keys come from the shell (or the hidden input); a click only opens the soft keyboard. -->
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div
    class="field"
    class:slowed={game.slowLeft > 0}
    class:touch={touchUi}
    bind:this={fieldEl}
    bind:clientWidth={fieldW}
    bind:clientHeight={fieldH}
    style="font-size: {fontPx}px"
    on:pointerdown={(e) => (pointerType = e.pointerType)}
    on:click={openKeyboard}
  >
    <span class="probe" aria-hidden="true" bind:clientWidth={probeW}>0000000000</span>

    {#if target && fieldW}
      <svg class="laser" aria-hidden="true" width={fieldW} height={fieldH}>
        <line x1={fieldW / 2} y1={fieldH} x2={centerPx(target)} y2={target.y * fieldH} />
      </svg>
    {/if}

    {#each game.words as w (w.id)}
      <div
        class="word"
        class:target={w === target}
        class:danger={w.y > 0.72}
        class:special={w.kind !== 'normal'}
        data-kind={w.kind}
        data-badge={w.kind === 'clear' ? 'clears screen' : w.kind === 'slow' ? 'slows time' : null}
        style="left: {leftOf(w.x, w.text.length)}; transform: translate3d(0, calc({(w.y * fieldH).toFixed(1)}px - 100%), 0)"
      ><span class="typed">{w.text.slice(0, w.typed)}</span>{w.text.slice(w.typed)}</div>
    {/each}

    {#each game.bursts as b (b.id)}
      <div class="burst" class:special={b.kind !== 'normal'} style="left: {centerOf(b.x, b.len)}; top: {b.y * fieldH - fontPx * 0.75}px" aria-hidden="true">
        {#each SPARKS as a}<i class="spark" style="--a: {a}deg" />{/each}
        <span class="points">+{b.points}</span>
      </div>
    {/each}

    {#if game.banner}
      {#key game.banner.id}
        <div class="banner" out:fade={{ duration: 180 }}>
          <b>{game.banner.title}</b>
          {#if !compact}<span>{game.banner.sub}</span>{/if}
        </div>
      {/key}
    {/if}

    <div class="baseline" class:breach={game.time - game.breachAt < 0.45} />

    {#if touchUi && !typing && !game.over}
      <span class="tap-hint">tap to type</span>
    {/if}

    <input
      bind:this={input}
      class="typer-input"
      type="text"
      tabindex="-1"
      autocomplete="off"
      autocapitalize="none"
      spellcheck="false"
      enterkeyhint="done"
      aria-label="Type the falling words"
      on:input={onInput}
      on:keydown={onInputKey}
      on:compositionend={resetInput}
      on:focus={onInputFocus}
      on:blur={onInputBlur}
    />
  </div>

  <div class="hud" class:tiny bind:clientHeight={hudH}>
    <span class="lives" role="img" aria-label="{game.lives} of {game.maxLives} lives">
      {#each Array(game.maxLives) as _, i}
        <svg class="heart" class:lost={i >= game.lives} viewBox="0 0 16 16"><path d={HEART} /></svg>
      {/each}
    </span>
    <span class="prompt" class:shake={game.time - game.missAt < 0.25}>
      <span class="sigil">›</span>
      {#if target}<span class="buffer">{target.text.slice(0, target.typed)}</span>{:else if !tiny}<span class="placeholder">{placeholder}</span>{/if}
      <span class="blinker" />
    </span>
    {#if game.slowLeft > 0}<span class="slow-tag">slow {Math.ceil(game.slowLeft)}s</span>{/if}
    <span class="mult" class:hot={game.multiplier > 1} title="combo multiplier">x{game.multiplier}</span>
    {#if !compact}
      <span class="meta">combo {game.combo}</span>
      <span class="meta">wave {game.wave}</span>
    {/if}
  </div>
</div>

<style>
  .typer {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    overflow: hidden;
    user-select: none;
    -webkit-user-select: none;
  }
  .field {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    cursor: text;
    background-image: radial-gradient(color-mix(in srgb, var(--bg2) 60%, transparent) 1px, transparent 1.2px);
    background-size: 24px 24px;
    background-position: 12px 12px;
    transition: background-color 0.3s;
  }
  .field.touch {
    touch-action: manipulation;
  }
  .field::after {
    content: '';
    position: absolute;
    inset: auto 0 0 0;
    height: 22%;
    background: linear-gradient(to top, color-mix(in srgb, var(--hl1) 9%, transparent), transparent);
    pointer-events: none;
  }
  .field.slowed {
    background-color: color-mix(in srgb, var(--hl1) 6%, transparent);
  }
  .probe {
    position: absolute;
    display: inline-block;
    visibility: hidden;
    white-space: pre;
    pointer-events: none;
  }
  .laser {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .laser line {
    stroke: var(--hl1);
    stroke-width: 1;
    stroke-dasharray: 3 5;
    opacity: 0.45;
  }
  .word {
    position: absolute;
    top: 0;
    padding: 0.12em 0.5ch;
    border-radius: 4px;
    border: 1px solid var(--bg2);
    background: color-mix(in srgb, var(--bg2) 30%, var(--bg1));
    color: var(--t2);
    line-height: 1.35;
    white-space: pre;
    will-change: transform;
  }
  .word.danger {
    border-color: color-mix(in srgb, var(--hl1) 60%, var(--bg2));
  }
  .word.special {
    border-style: dashed;
    border-color: var(--hl1);
  }
  .word.special::before {
    content: attr(data-badge);
    position: absolute;
    left: 50%;
    bottom: 100%;
    transform: translate(-50%, -2px);
    font-size: 0.55em;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
    color: var(--hl1);
  }
  .word.target {
    z-index: 2;
    border-color: var(--hl1);
    background: color-mix(in srgb, var(--hl1) 14%, var(--bg1));
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--hl1) 35%, transparent), 0 0 14px color-mix(in srgb, var(--hl1) 25%, transparent);
  }
  .typed {
    color: var(--hl1);
    box-shadow: inset 0 -2px 0 var(--hl1);
  }
  .burst {
    position: absolute;
    width: 0;
    height: 0;
    pointer-events: none;
    z-index: 3;
  }
  .spark {
    position: absolute;
    left: -0.15em;
    top: -0.15em;
    width: 0.3em;
    height: 0.3em;
    border-radius: 1px;
    background: var(--t2);
    animation: spark 0.55s ease-out forwards;
  }
  .burst.special .spark,
  .spark:nth-child(odd) {
    background: var(--hl1);
  }
  .points {
    position: absolute;
    left: 0;
    top: -0.6em;
    font-size: 0.75em;
    font-weight: 700;
    color: var(--hl1);
    white-space: nowrap;
    animation: rise 0.85s ease-out forwards;
  }
  .banner {
    position: absolute;
    inset: 0 0 18% 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    pointer-events: none;
    text-align: center;
    animation: banner-in 0.3s ease-out;
  }
  .banner b {
    font-size: 1.5em;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--hl1);
  }
  .banner span {
    font-size: 0.7em;
    color: var(--t1);
  }
  .baseline {
    position: absolute;
    inset: auto 0 0 0;
    height: 2px;
    background: repeating-linear-gradient(90deg, color-mix(in srgb, var(--hl1) 75%, transparent) 0 8px, transparent 8px 14px);
    transition: box-shadow 0.2s;
  }
  .baseline.breach {
    height: 3px;
    background: var(--hl1);
    box-shadow: 0 0 14px var(--hl1);
  }
  .tap-hint {
    position: absolute;
    left: 50%;
    bottom: 16px;
    transform: translateX(-50%);
    padding: 7px 16px;
    border-radius: 999px;
    border: 1px dashed var(--hl1);
    background: color-mix(in srgb, var(--bg1) 85%, transparent);
    color: var(--t2);
    font-size: 13px;
    white-space: nowrap;
    pointer-events: none;
  }
  /* Focusable for the soft keyboard but invisible; 16px stops iOS zooming in. */
  .typer-input {
    position: absolute;
    left: 50%;
    bottom: 0;
    width: 2px;
    height: 2px;
    padding: 0;
    border: 0;
    opacity: 0;
    font-size: 16px;
    color: transparent;
    background: transparent;
    caret-color: transparent;
    pointer-events: none;
  }
  .hud {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 28px;
    padding: 3px 10px;
    border-top: 1px solid color-mix(in srgb, var(--bg2) 70%, transparent);
    font-size: 12px;
    color: var(--t1);
    white-space: nowrap;
  }
  .hud.tiny {
    gap: 6px;
    padding: 2px 6px;
  }
  .lives {
    display: flex;
    gap: 3px;
    flex: none;
  }
  .heart {
    width: 14px;
    height: 14px;
    fill: var(--hl1);
    stroke: var(--hl1);
    stroke-width: 1;
    transition: fill 0.2s, opacity 0.2s;
  }
  .heart.lost {
    fill: transparent;
    stroke: var(--t1);
    opacity: 0.55;
  }
  .prompt {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    overflow: hidden;
    white-space: pre;
    color: var(--t2);
    font-size: 13px;
  }
  .prompt.shake {
    animation: shake 0.25s;
  }
  .sigil {
    color: var(--hl1);
    margin-right: 0.6ch;
  }
  .buffer {
    color: var(--hl1);
  }
  .placeholder {
    color: var(--t1);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .blinker {
    flex: none;
    width: 0.55em;
    height: 1.05em;
    margin-left: 1px;
    background: var(--hl1);
    opacity: 0.8;
    animation: blink 1.1s steps(2, start) infinite;
  }
  .mult {
    flex: none;
    padding: 0 6px;
    border-radius: 4px;
    border: 1px solid var(--bg2);
    color: var(--t1);
    font-weight: 700;
  }
  .mult.hot {
    border-color: var(--hl1);
    color: var(--hl1);
  }
  .slow-tag {
    color: var(--hl1);
  }
  .meta {
    flex: none;
  }

  /* The shell's arrow pad has nothing to steer in a typing game: give the board that room. */
  :global(.shell:has(.typer) > .pad) {
    display: none;
  }

  @keyframes spark {
    from {
      transform: rotate(var(--a)) translateX(0.2em) scale(1);
      opacity: 1;
    }
    to {
      transform: rotate(var(--a)) translateX(2.6em) scale(0.3);
      opacity: 0;
    }
  }
  @keyframes rise {
    from {
      transform: translate(-50%, 0);
      opacity: 1;
    }
    to {
      transform: translate(-50%, -1.8em);
      opacity: 0;
    }
  }
  @keyframes banner-in {
    from {
      opacity: 0;
      transform: scale(0.92);
    }
  }
  @keyframes shake {
    25% {
      transform: translateX(-3px);
    }
    75% {
      transform: translateX(3px);
    }
  }
  @keyframes blink {
    to {
      visibility: hidden;
    }
  }
</style>
