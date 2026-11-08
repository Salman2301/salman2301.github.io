/**
 * Shared contracts for the whole app. Widgets, games, commands, templates and
 * overlays are all discovered automatically from their folders (see
 * registry.ts), so adding a feature never requires editing a shared file:
 *
 *   src/lib/widgets/<id>/index.ts    -> export default WidgetDef
 *   src/lib/games/<id>/index.ts      -> export default GameDef
 *   src/lib/commands/<name>.ts       -> export default CommandDef | CommandDef[]
 *   src/lib/overlays/<id>/index.ts   -> export default OverlayDef
 */

// Svelte 3 component constructors are loosely typed on purpose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyComponent = any;

export type Config = Record<string, unknown>;

/* ------------------------------------------------------------------ widgets */

/**
 * A widget is anything that can live in a pane: the terminal, pomodoro,
 * notes, a YouTube player, the arcade, ...
 *
 * The widget component receives exactly these props:
 *   paneId:       string                      id of the pane it lives in
 *   focused:      boolean                     true when its pane has focus
 *   config:       Config                      the pane's persisted config
 *   updateConfig: (patch: Config) => void     merge + persist into config
 *
 * Keep per-pane state (a chosen video, a selected game) in `config` so it
 * survives reloads and is captured by templates and share links. Keep
 * global state (all notes, pomodoro stats) in a `persisted` store.
 */
export interface WidgetDef {
  id: string;
  title: string;
  description: string;
  /** One or two plain glyph characters, never emoji. e.g. ">_", "◷", "♪". */
  icon: string;
  component: AnyComponent;
  defaultConfig?: Config;
  /** Hide from pickers (still usable from templates and commands). */
  hidden?: boolean;
  /** Search keywords for the palette and widget menu. */
  keywords?: string[];
  /** Optional: title shown in the pane header, derived from config. */
  paneTitle?: (config: Config) => string;
}

/* -------------------------------------------------------------------- games */

/**
 * Game components are hosted inside <GameShell>, which owns focus, pausing,
 * score and high-score display, the game-over overlay and restart. A game
 * component receives exactly these props:
 *
 *   paused: boolean   stop every loop/timer while true
 *   api:    GameApi
 *
 * Never listen to keyboard events on `window`: several panes can be open
 * at once and a global listener would steal keys from the terminal. Use
 * api.onKeyDown / api.onKeyUp, which only fire while the game has focus.
 */
export interface GameDef {
  id: string;
  title: string;
  description: string;
  /** Short controls hint, e.g. "arrows move · space drop". */
  controls: string;
  component: AnyComponent;
  /** Lower is better (e.g. time-based games). Default false. */
  lowerIsBetter?: boolean;
  /** Score label, default "score". */
  scoreLabel?: string;
  /**
   * Typing games: the shell normally uses P to pause. With this flag only
   * Escape pauses, and every other key goes to the game.
   */
  captureAllKeys?: boolean;
}

export interface GameApi {
  onKeyDown(handler: (e: KeyboardEvent) => void): () => void;
  onKeyUp(handler: (e: KeyboardEvent) => void): () => void;
  setScore(score: number): void;
  /** Ends the run; shows the game-over overlay and records the high score. */
  gameOver(finalScore?: number, message?: string): void;
  /** Best score recorded so far for this game (0 when none). */
  readonly highScore: number;
  /** Play a short synthesized sound effect. */
  sfx(kind: 'blip' | 'score' | 'hit' | 'win' | 'lose'): void;
}

/* ----------------------------------------------------------------- commands */

export type Tone = 'normal' | 'muted' | 'accent' | 'error' | 'success';

export interface CommandContext {
  /** The full line the user typed. */
  raw: string;
  /** Arguments after the command name, quotes respected. */
  args: string[];
  /** Pane id of the terminal running the command. */
  paneId: string;
  print(text: string, tone?: Tone): void;
  /** Render a svelte component as output. It can use getContext(TERMINAL_CTX). */
  render(component: AnyComponent, props?: Record<string, unknown>): void;
  clear(): void;
  /** Run another command line in this terminal. */
  run(line: string): Promise<void>;
  /**
   * Aborted when the user presses Ctrl+C. Long-running commands (animations,
   * typewriters) should stop when it fires. `sleep(ms, signal)` from
   * terminal/parse.ts makes this easy.
   */
  signal: AbortSignal;
}

export type CommandGroup = 'general' | 'workspace' | 'widgets' | 'games' | 'fun' | 'system';

export interface CommandDef {
  name: string;
  aliases?: string[];
  description: string;
  /** e.g. "pomodoro [start|pause|reset|25/5]" */
  usage?: string;
  group?: CommandGroup;
  hidden?: boolean;
  /** Tab-completion candidates for the argument being typed. */
  complete?(args: string[]): string[];
  run(ctx: CommandContext): void | Promise<void>;
}

/* ----------------------------------------------------------------- overlays */

/** Components mounted once at the app root (palette, boot screen, CRT, ...). */
export interface OverlayDef {
  id: string;
  component: AnyComponent;
  /** Higher renders later (on top). Default 0. */
  order?: number;
}
