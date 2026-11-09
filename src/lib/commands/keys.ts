import type { CommandDef } from '../core/types';
import { openOverlay } from '../core/ui';

const command: CommandDef = {
  name: 'keys',
  aliases: ['shortcuts', 'keybindings', 'hotkeys'],
  description: 'list every keyboard shortcut (alt+/)',
  group: 'general',
  run: () => openOverlay.set('keys'),
};

export default command;
