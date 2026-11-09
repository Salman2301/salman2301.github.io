import type { CommandDef, GameDef, OverlayDef, WidgetDef } from './types';

/**
 * Auto-discovery. Every feature folder is picked up at build time by Vite's
 * import.meta.glob, so features never edit a shared list.
 */

type Mod<T> = { default: T | T[] };

function collect<T extends { id?: string; name?: string }>(
  modules: Record<string, Mod<T>>,
  kind: string,
): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const [path, mod] of Object.entries(modules)) {
    const value = mod?.default;
    if (!value) {
      console.warn(`[registry] ${kind} module ${path} has no default export`);
      continue;
    }
    for (const item of Array.isArray(value) ? value : [value]) {
      const key = (item.id ?? item.name) as string;
      if (seen.has(key)) {
        console.warn(`[registry] duplicate ${kind} "${key}" in ${path}`);
        continue;
      }
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

const widgetModules = import.meta.glob('../widgets/*/index.ts', { eager: true }) as Record<string, Mod<WidgetDef>>;
const gameModules = import.meta.glob('../games/*/index.ts', { eager: true }) as Record<string, Mod<GameDef>>;
const commandModules = import.meta.glob('../commands/*.ts', { eager: true }) as Record<string, Mod<CommandDef>>;
const overlayModules = import.meta.glob('../overlays/*/index.ts', { eager: true }) as Record<string, Mod<OverlayDef>>;

/** Widgets, ordered: terminal first, then alphabetical by title. */
export const widgets: WidgetDef[] = collect(widgetModules, 'widget').sort((a, b) =>
  a.id === 'terminal' ? -1 : b.id === 'terminal' ? 1 : a.title.localeCompare(b.title),
);
export const games: GameDef[] = collect(gameModules, 'game').sort((a, b) => a.title.localeCompare(b.title));
export const commands: CommandDef[] = collect(commandModules, 'command');
export const overlays: OverlayDef[] = collect(overlayModules, 'overlay').sort(
  (a, b) => (a.order ?? 0) - (b.order ?? 0),
);

export function getWidget(id: string): WidgetDef | undefined {
  return widgets.find((w) => w.id === id);
}

export function getGame(id: string): GameDef | undefined {
  const needle = id.toLowerCase();
  return games.find((g) => g.id === needle || g.title.toLowerCase() === needle);
}

const commandIndex = new Map<string, CommandDef>();
for (const cmd of commands) {
  for (const key of [cmd.name, ...(cmd.aliases ?? [])]) {
    if (commandIndex.has(key)) console.warn(`[registry] command name "${key}" is taken`);
    else commandIndex.set(key, cmd);
  }
}

export function getCommand(name: string): CommandDef | undefined {
  return commandIndex.get(name.toLowerCase());
}

/** All invocable names (names and aliases), for completion. */
export function commandNames(includeHidden = false): string[] {
  return commands
    .filter((c) => includeHidden || !c.hidden)
    .flatMap((c) => [c.name, ...(c.aliases ?? [])])
    .sort();
}

/** What `<command> --help` prints: usage, description, aliases and the long help. */
export function commandHelp(cmd: CommandDef): string {
  const lines = [`usage: ${cmd.usage ?? cmd.name}`, '', cmd.description];
  if (cmd.aliases?.length) lines.push(`also: ${cmd.aliases.join(', ')}`);
  if (cmd.help) lines.push('', cmd.help.replace(/^\s*\n/, '').trimEnd());
  return lines.join('\n');
}
