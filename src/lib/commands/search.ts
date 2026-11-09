import type { CommandDef } from '../core/types';
import { openOverlay } from '../core/ui';

const command: CommandDef = {
  name: 'search',
  aliases: ['find'],
  description: 'search tasks, notes, commands, themes and more (⌘K / Ctrl+K)',
  group: 'general',
  run: (ctx) => {
    openOverlay.set('search');
    ctx.print('search opened · ⌘K or Ctrl+K opens it from anywhere', 'muted');
  },
};

export default command;
