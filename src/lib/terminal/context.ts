import { persisted } from '../core/storage';

/** Context key exposed by every terminal to the components it renders. */
export const TERMINAL_CTX = 'terminal-ctx';

export interface TerminalContext {
  paneId: string;
  /** Type and run a command line in this terminal, as if the user entered it. */
  run(line: string): Promise<void>;
  print(text: string, tone?: 'normal' | 'muted' | 'accent' | 'error' | 'success'): void;
  focusInput(): void;
}

/** Live terminals by pane id. Terminal.svelte registers itself on mount. */
export const terminals = new Map<string, TerminalContext>();

/**
 * Run a command line from outside a terminal (command palette, overlays,
 * buttons). Uses the terminal in `paneId`, else the focused terminal, else
 * any open terminal, else opens a new terminal pane that runs it on start.
 */
export async function runInTerminal(line: string, paneId?: string): Promise<void> {
  const { get } = await import('svelte/store');
  const ws = await import('../core/workspace');
  const state = get(ws.workspace);
  const target =
    (paneId && terminals.get(paneId)) ||
    (state.focused && terminals.get(state.focused)) ||
    ws
      .leaves(state.root)
      .map((l) => terminals.get(l.id))
      .find(Boolean);
  if (target) {
    ws.focusPane(target.paneId);
    await target.run(line);
    return;
  }
  ws.openWidget('terminal', { startup: [line] }, { reuse: false });
}

/** Command history shared by all terminals, newest last. */
export const commandHistory = persisted<string[]>('terminal:history', []);

export const PROMPT_USER = 'salman';
export const PROMPT_HOST = 'portfolio';
