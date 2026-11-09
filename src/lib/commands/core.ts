import { get } from 'svelte/store';
import type { CommandDef } from '../core/types';
import { chooseTheme, cycleThemeHere } from '../core/spaces';
import { setThemeMode, THEME_MODES, themeNames, type ThemeMode } from '../core/theme';
import { soundEnabled } from '../core/sound';
import { commandHistory } from '../terminal/context';
import Help from '../terminal/output/Help.svelte';
import Whoami from '../terminal/output/Whoami.svelte';
import Motd from '../terminal/output/Motd.svelte';
import ThemeList from '../terminal/output/ThemeList.svelte';

const commands: CommandDef[] = [
  {
    name: 'help',
    aliases: ['?', 'commands'],
    description: 'list every command',
    group: 'general',
    run: (ctx) => ctx.render(Help),
  },
  {
    name: 'whoami',
    aliases: ['about'],
    description: 'about the author',
    group: 'general',
    run: (ctx) => ctx.render(Whoami),
  },
  {
    name: 'motd',
    aliases: ['welcome'],
    description: 'show the welcome message and shortcuts',
    group: 'general',
    run: (ctx) => ctx.render(Motd),
  },
  {
    name: 'clear',
    aliases: ['cls'],
    description: 'clear this terminal (ctrl+l)',
    group: 'general',
    run: (ctx) => ctx.clear(),
  },
  {
    name: 'echo',
    description: 'print text',
    usage: 'echo <text>',
    group: 'general',
    run: (ctx) => ctx.print(ctx.args.join(' ')),
  },
  {
    name: 'history',
    description: 'show recent commands, "history clear" to wipe',
    usage: 'history [clear]',
    group: 'general',
    complete: () => ['clear'],
    run: (ctx) => {
      if (ctx.args[0] === 'clear') {
        commandHistory.set([]);
        ctx.print('history cleared', 'muted');
        return;
      }
      const h = get(commandHistory);
      const start = Math.max(0, h.length - 20);
      if (!h.length) return ctx.print('no history yet', 'muted');
      ctx.print(
        h
          .slice(start)
          .map((c, i) => `${String(start + i + 1).padStart(4)}  ${c}`)
          .join('\n'),
      );
    },
  },
  {
    name: 'time',
    aliases: ['date'],
    description: 'show the current date and time',
    group: 'general',
    run: (ctx) => {
      const d = new Date();
      ctx.print(
        `${d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}  ${d.toLocaleTimeString()}`,
      );
    },
  },
  {
    name: 'theme',
    aliases: ['themes'],
    description: 'list themes or switch: theme tokyo-night, theme system|dark|light',
    usage: 'theme [name|next|random|system|dark|light]',
    group: 'system',
    complete: () => [...THEME_MODES, 'next', 'random', ...themeNames],
    run: (ctx) => {
      const name = ctx.args[0];
      if (!name) return ctx.render(ThemeList);
      if ((THEME_MODES as string[]).includes(name)) {
        setThemeMode(name as ThemeMode);
        return ctx.print(name === 'system' ? 'theme follows your system light / dark setting' : `theme mode: ${name}`, 'muted');
      }
      if (name === 'next' || name === 'random') {
        const next = cycleThemeHere(name === 'random');
        return ctx.print(`theme: ${next}`, 'muted');
      }
      if (!chooseTheme(name)) ctx.print(`theme "${name}" not found. Type "theme" to list them.`, 'error');
      else ctx.print(`theme: ${name}`, 'muted');
    },
  },
  {
    name: 'sound',
    description: 'turn sound effects on or off',
    usage: 'sound [on|off]',
    group: 'system',
    complete: () => ['on', 'off'],
    run: (ctx) => {
      const arg = ctx.args[0];
      const next = arg === 'on' ? true : arg === 'off' ? false : !get(soundEnabled);
      soundEnabled.set(next);
      ctx.print(`sound ${next ? 'on' : 'off'}`, 'muted');
    },
  },
];

export default commands;
