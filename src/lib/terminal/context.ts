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

/** Command history shared by all terminals, newest last. */
export const commandHistory = persisted<string[]>('terminal:history', []);

export const PROMPT_USER = 'salman';
export const PROMPT_HOST = 'portfolio';
