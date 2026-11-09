import type { CommandDef } from '../core/types';
import { openWidget } from '../core/workspace';
import { LEVELS, type Level } from '../widgets/calendar/cal';

const command: CommandDef = {
  name: 'calendar',
  aliases: ['cal'],
  description: 'open the calendar: calendar week (year, month, week or day)',
  usage: 'calendar [year|month|week|day]',
  group: 'widgets',
  complete: (args) => (args.length <= 1 ? [...LEVELS] : []),
  run: (ctx) => {
    const word = (ctx.args[0] ?? '').toLowerCase();
    if (word && !(LEVELS as readonly string[]).includes(word)) {
      return ctx.print(`usage: calendar [${LEVELS.join('|')}]`, 'error');
    }
    openWidget('calendar', word ? { level: word as Level } : undefined, { from: ctx.paneId });
  },
};

export default command;
