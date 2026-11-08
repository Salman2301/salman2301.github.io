import { get } from 'svelte/store';
import { games, getGame } from '../core/registry';
import type { CommandDef } from '../core/types';
import { openWidget } from '../core/workspace';
import { highScores, plays } from '../games/scores';

const commands: CommandDef[] = [
  {
    name: 'games',
    aliases: ['arcade'],
    description: 'open the arcade with every mini game',
    group: 'games',
    run: (ctx) => {
      ctx.print(
        games.map((g) => `  ${g.id.padEnd(12)} ${g.description}`).join('\n') + '\n\nplay one with: play <name>',
      );
      openWidget('arcade', { game: null }, { from: ctx.paneId });
    },
  },
  {
    name: 'play',
    description: 'play a game: play snake',
    usage: 'play <game>',
    group: 'games',
    complete: () => games.map((g) => g.id),
    run: (ctx) => {
      const id = ctx.args[0];
      if (!id) return ctx.run('games');
      const g = getGame(id);
      if (!g) return ctx.print(`no game "${id}". Available: ${games.map((x) => x.id).join(', ')}`, 'error');
      openWidget('arcade', { game: g.id }, { from: ctx.paneId });
    },
  },
  {
    name: 'scores',
    aliases: ['highscores'],
    description: 'show your best scores',
    group: 'games',
    run: (ctx) => {
      const hs = get(highScores);
      const pl = get(plays);
      ctx.print(
        games
          .map((g) => `  ${g.title.padEnd(14)} best ${String(hs[g.id] ?? '-').padStart(6)}   played ${pl[g.id] ?? 0}`)
          .join('\n'),
      );
    },
  },
];

export default commands;
