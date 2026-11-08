<script lang="ts" context="module">
  import type { AnyComponent, Tone } from '../../core/types';

  type Entry =
    | { id: number; kind: 'echo'; text: string }
    | { id: number; kind: 'text'; text: string; tone: Tone }
    | { id: number; kind: 'component'; component: AnyComponent; props: Record<string, unknown> };
  type NewEntry =
    | { kind: 'echo'; text: string }
    | { kind: 'text'; text: string; tone: Tone }
    | { kind: 'component'; component: AnyComponent; props: Record<string, unknown> };

  /**
   * Terminal sessions outlive their component: splitting or moving a pane
   * remounts it, and the scrollback should survive that.
   */
  const sessions = new Map<string, { entries: Entry[]; started: boolean }>();
  let nextEntryId = 1;
</script>

<script lang="ts">
  import { onDestroy, onMount, setContext, tick } from 'svelte';
  import { getCommand, commandNames } from '../../core/registry';
  import type { Config } from '../../core/types';
  import { commandHistory, PROMPT_HOST, PROMPT_USER, TERMINAL_CTX, terminals, type TerminalContext } from '../../terminal/context';
  import { commonPrefix, levenshtein, splitChain, tokenize } from '../../terminal/parse';

  export let paneId: string;
  export let focused = false;
  export let config: Config = {};
  export let updateConfig: (patch: Config) => void = () => {};
  $: void updateConfig; // part of the widget contract, unused here

  const session = sessions.get(paneId) ?? { entries: [], started: false };
  sessions.set(paneId, session);

  let entries: Entry[] = session.entries;
  $: session.entries = entries;

  let value = '';
  let input: HTMLInputElement;
  let scroller: HTMLDivElement;
  let busy = false;
  let controller: AbortController | null = null;
  let historyPos = -1; // -1 = editing a new line
  let draft = '';

  /* -------------------------------------------------------------- output */

  function push(entry: NewEntry) {
    entries = [...entries, { ...entry, id: nextEntryId++ } as Entry].slice(-400);
    scrollSoon();
  }

  async function scrollSoon() {
    await tick();
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }

  const print = (text: string, tone: Tone = 'normal') => push({ kind: 'text', text, tone });
  const render = (component: AnyComponent, props: Record<string, unknown> = {}) =>
    push({ kind: 'component', component, props });
  const clear = () => {
    entries = [];
  };

  /* ----------------------------------------------------------- execution */

  async function runOne(line: string, signal: AbortSignal) {
    const tokens = tokenize(line);
    if (!tokens.length) return;
    const [name, ...args] = tokens;
    const cmd = getCommand(name);
    if (!cmd) {
      const names = commandNames();
      const best = names
        .map((n) => ({ n, d: levenshtein(name.toLowerCase(), n) }))
        .sort((a, b) => a.d - b.d)[0];
      const hint = best && best.d <= 2 ? ` Did you mean "${best.n}"?` : ' Type "help" to list commands.';
      print(`command not found: ${name}.${hint}`, 'error');
      return;
    }
    await cmd.run({ raw: line, args, paneId, print, render, clear, run: (l) => runLine(l, signal), signal });
  }

  async function runLine(line: string, signal: AbortSignal) {
    for (const part of splitChain(line)) {
      if (signal.aborted) return;
      await runOne(part, signal);
    }
  }

  async function execute(line: string, opts: { echo?: boolean; remember?: boolean } = {}) {
    const { echo = true, remember = true } = opts;
    if (echo) push({ kind: 'echo', text: line });
    const trimmed = line.trim();
    if (!trimmed) return;
    if (remember) {
      commandHistory.update((h) => (h[h.length - 1] === trimmed ? h : [...h, trimmed].slice(-300)));
    }
    controller = new AbortController();
    busy = true;
    try {
      await runLine(trimmed, controller.signal);
    } catch (err) {
      if ((err as DOMException)?.name !== 'AbortError') {
        print(`error: ${(err as Error)?.message ?? String(err)}`, 'error');
        console.error(err);
      }
    } finally {
      busy = false;
      controller = null;
      historyPos = -1;
      await scrollSoon();
      if (focused) focusInput();
    }
  }

  function focusInput() {
    input?.focus({ preventScroll: true });
  }

  const ctx: TerminalContext = {
    paneId,
    run: async (line: string) => {
      if (busy) return;
      value = '';
      await execute(line);
    },
    print,
    focusInput,
  };
  setContext(TERMINAL_CTX, ctx);

  /* --------------------------------------------------------- completion */

  function candidatesFor(text: string): { candidates: string[]; head: string; partial: string } {
    const endsWithSpace = /\s$/.test(text);
    const tokens = tokenize(text);
    if (tokens.length === 0) return { candidates: [], head: '', partial: '' };
    if (tokens.length === 1 && !endsWithSpace) {
      const partial = tokens[0].toLowerCase();
      return { candidates: commandNames().filter((n) => n.startsWith(partial)), head: '', partial };
    }
    const cmd = getCommand(tokens[0]);
    if (!cmd?.complete) return { candidates: [], head: '', partial: '' };
    const args = tokens.slice(1);
    if (endsWithSpace) args.push('');
    const partial = args[args.length - 1] ?? '';
    const head = text.slice(0, text.length - partial.length);
    let options: string[] = [];
    try {
      options = cmd.complete(args) ?? [];
    } catch {
      options = [];
    }
    return { candidates: options.filter((o) => o.toLowerCase().startsWith(partial.toLowerCase())), head, partial };
  }

  /** Fish-style ghost suggestion: latest matching history entry, else completion. */
  function suggestionFor(text: string, history: string[]): string {
    if (!text.trim()) return '';
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].startsWith(text) && history[i] !== text) return history[i];
    }
    const { candidates, head } = candidatesFor(text);
    if (candidates.length) return head + candidates[0];
    return '';
  }

  /* Floating completion menu: hovers over the output instead of printing into it. */
  let menuIndex = 0;
  let menuDismissed = false;
  let menuBelow = false;
  $: comp = busy || !value.trim() ? { candidates: [] as string[], head: '', partial: '' } : candidatesFor(value);
  $: menu = menuDismissed ? [] : comp.candidates.filter((c) => c !== comp.partial).slice(0, 8);
  $: menuOpen = menu.length >= 2;
  $: if (menuIndex >= menu.length) menuIndex = 0;

  $: suggestion = busy ? '' : menuOpen ? comp.head + menu[menuIndex] : suggestionFor(value, $commandHistory);
  $: ghost = suggestion.startsWith(value) ? suggestion.slice(value.length) : '';

  function describe(item: string): string {
    return comp.head === '' ? getCommand(item)?.description ?? '' : '';
  }

  function onInput() {
    menuIndex = 0;
    menuDismissed = false;
    if (input && scroller) {
      // open the menu below the prompt when there is no room above it
      menuBelow = input.getBoundingClientRect().top - scroller.getBoundingClientRect().top < 190;
    }
  }

  function accept(item: string) {
    value = comp.head + item + ' ';
    menuIndex = 0;
    moveCaretToEnd();
  }

  function complete() {
    if (menuOpen) return accept(menu[menuIndex]);
    const { candidates, head } = comp;
    if (!candidates.length) return;
    if (candidates.length === 1) {
      value = head + candidates[0] + ' ';
      return;
    }
    const next = head + commonPrefix(candidates);
    if (next.length > value.length) value = next;
  }

  /* ------------------------------------------------------------ keyboard */

  function onKeyDown(e: KeyboardEvent) {
    if (e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'c') {
      if (window.getSelection()?.toString()) return; // allow copy
      e.preventDefault();
      if (busy && controller) {
        controller.abort();
        print('^C', 'muted');
      } else {
        push({ kind: 'echo', text: value + '^C' });
        value = '';
      }
      return;
    }
    if (busy) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const line = value;
      value = '';
      void execute(line);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      complete();
    } else if (e.key === 'ArrowRight' && ghost && input.selectionStart === value.length) {
      e.preventDefault();
      value = suggestion;
    } else if (menuOpen && historyPos === -1 && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const d = e.key === 'ArrowDown' ? 1 : -1;
      menuIndex = (menuIndex + d + menu.length) % menu.length;
    } else if (menuOpen && e.key === 'Escape') {
      e.preventDefault();
      menuDismissed = true;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const h = $commandHistory;
      if (!h.length) return;
      if (historyPos === -1) {
        draft = value;
        historyPos = h.length - 1;
      } else if (historyPos > 0) historyPos--;
      value = h[historyPos];
      moveCaretToEnd();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const h = $commandHistory;
      if (historyPos === -1) return;
      if (historyPos < h.length - 1) {
        historyPos++;
        value = h[historyPos];
      } else {
        historyPos = -1;
        value = draft;
      }
      moveCaretToEnd();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      clear();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'u') {
      e.preventDefault();
      value = '';
    }
  }

  async function moveCaretToEnd() {
    await tick();
    input?.setSelectionRange(value.length, value.length);
  }

  function onSurfaceClick() {
    if (window.getSelection()?.toString()) return;
    focusInput();
  }

  /* ----------------------------------------------------------- lifecycle */

  let wasFocused = false;
  $: {
    if (focused && !wasFocused) tick().then(focusInput);
    wasFocused = focused;
  }

  onMount(async () => {
    terminals.set(paneId, ctx);
    scrollSoon();
    if (!session.started) {
      session.started = true;
      const startup = Array.isArray(config.startup) ? (config.startup as string[]) : [];
      for (const line of startup) await execute(line, { remember: false });
    }
    if (focused) focusInput();
  });

  onDestroy(() => {
    controller?.abort();
    if (terminals.get(paneId) === ctx) terminals.delete(paneId);
  });

  /* ------------------------------------------------------------- linkify */

  const URL_RE = /(https?:\/\/[^\s)]+)/g;
  function segments(text: string): { text: string; href?: string }[] {
    const parts: { text: string; href?: string }[] = [];
    let last = 0;
    for (const m of text.matchAll(URL_RE)) {
      if (m.index! > last) parts.push({ text: text.slice(last, m.index) });
      parts.push({ text: m[0], href: m[0] });
      last = m.index! + m[0].length;
    }
    if (last < text.length) parts.push({ text: text.slice(last) });
    return parts;
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<div class="terminal" bind:this={scroller} on:click={onSurfaceClick}>
  {#each entries as entry (entry.id)}
    {#if entry.kind === 'echo'}
      <div class="line echo">
        <span class="prompt"><span class="user">{PROMPT_USER}</span><span class="at">@</span><span class="host">{PROMPT_HOST}</span><span class="path">:~$</span></span>
        <span class="cmd">{entry.text}</span>
      </div>
    {:else if entry.kind === 'text'}
      <div class="line text tone-{entry.tone}">
        {#each segments(entry.text) as seg}{#if seg.href}<a href={seg.href} target="_blank" rel="noopener noreferrer">{seg.text}</a>{:else}{seg.text}{/if}{/each}
      </div>
    {:else}
      <div class="block">
        <svelte:component this={entry.component} {...entry.props} />
      </div>
    {/if}
  {/each}

  <div class="line input-line" class:busy>
    <span class="prompt"><span class="user">{PROMPT_USER}</span><span class="at">@</span><span class="host">{PROMPT_HOST}</span><span class="path">:~$</span></span>
    <div class="field">
      <div class="ghost" aria-hidden="true"><span class="typed">{value}</span><span class="rest">{ghost}</span></div>
      <input
        bind:this={input}
        bind:value
        on:input={onInput}
        on:keydown={onKeyDown}
        spellcheck="false"
        autocomplete="off"
        autocapitalize="off"
        aria-label="Terminal input"
        disabled={false}
      />
      {#if menuOpen}
        <ul class="menu" class:below={menuBelow} role="listbox" aria-label="Completions">
          {#each menu as item, i (item)}
            <li role="option" aria-selected={i === menuIndex} class:active={i === menuIndex} on:mousedown|preventDefault={() => accept(item)}>
              <span class="item">{item}</span>
              {#if describe(item)}<span class="desc">{describe(item)}</span>{/if}
            </li>
          {/each}
          <li class="hint" aria-hidden="true">tab accept · up/down choose · esc close</li>
        </ul>
      {/if}
    </div>
  </div>
  {#if busy}<div class="line tone-muted hint">running... press Ctrl+C to stop</div>{/if}
</div>

<style>
  .terminal {
    height: 100%;
    overflow: auto;
    padding: 10px 14px 18px;
    color: var(--t2);
    font-size: 14px;
    line-height: 1.5;
    cursor: text;
    overscroll-behavior: contain;
  }
  .line {
    white-space: pre-wrap;
    word-break: break-word;
  }
  .block {
    margin: 2px 0 6px;
  }
  .prompt {
    white-space: nowrap;
    margin-right: 8px;
    flex-shrink: 0;
  }
  .user {
    color: var(--hl1);
    font-weight: 600;
  }
  .at,
  .path {
    color: var(--t1);
  }
  .host {
    color: var(--t2);
  }
  .echo {
    display: flex;
    margin-top: 6px;
  }
  .cmd {
    color: var(--t2);
  }
  .tone-muted {
    color: var(--t1);
  }
  .tone-accent {
    color: var(--hl1);
  }
  .tone-error {
    color: #ff6b6b;
  }
  .tone-success {
    color: #4ade80;
  }
  .text a {
    color: var(--hl1);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .input-line {
    display: flex;
    align-items: baseline;
    margin-top: 6px;
  }
  .input-line.busy {
    opacity: 0.35;
  }
  .field {
    white-space: normal;
    position: relative;
    flex: 1;
    min-width: 0;
  }
  .ghost,
  input {
    font: inherit;
    letter-spacing: inherit;
    white-space: pre;
    padding: 0;
    margin: 0;
    border: 0;
  }
  .ghost {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }
  .ghost .typed {
    visibility: hidden;
  }
  .ghost .rest {
    color: var(--t1);
    opacity: 0.55;
  }
  input {
    display: block;
    position: relative;
    width: 100%;
    background: transparent;
    color: var(--hl1);
    caret-color: var(--hl1);
    outline: none;
  }
  .hint {
    font-size: 12px;
  }
  .menu {
    position: absolute;
    left: 0;
    bottom: calc(100% + 4px);
    z-index: 20;
    min-width: 220px;
    max-width: min(520px, 100%);
    margin: 0;
    padding: 4px;
    list-style: none;
    border-radius: 8px;
    border: 1px solid var(--bg2);
    background: color-mix(in srgb, var(--bg2) 22%, var(--bg1));
    box-shadow: 0 12px 30px -12px rgba(0, 0, 0, 0.6);
    font-size: 13px;
    white-space: nowrap;
  }
  .menu.below {
    bottom: auto;
    top: calc(100% + 4px);
  }
  .menu li {
    display: flex;
    gap: 12px;
    padding: 2px 8px;
    border-radius: 5px;
    cursor: pointer;
    overflow: hidden;
  }
  .menu li.active {
    background: color-mix(in srgb, var(--hl1) 22%, transparent);
  }
  .menu .item {
    color: var(--t2);
  }
  .menu li.active .item {
    color: var(--hl1);
  }
  .menu .desc {
    color: var(--t1);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .menu li.hint {
    cursor: default;
    font-size: 11px;
    color: var(--t1);
    border-top: 1px dashed var(--bg2);
    border-radius: 0;
    margin-top: 2px;
    padding-top: 4px;
  }

  @media (max-width: 720px) {
    /* 16px stops iOS zooming when the prompt is focused. The ghost text inherits it, so completions stay aligned. */
    .input-line {
      font-size: 16px;
    }
  }
</style>
