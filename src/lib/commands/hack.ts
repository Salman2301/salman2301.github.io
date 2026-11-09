import { startScreensaver } from '../core/screensaver';
import type { CommandDef } from '../core/types';

/**
 * `hack [target]`: an obviously fake breach. It only plays the digital rain
 * full screen with a typed message: no network, no storage. Any key returns.
 */
const command: CommandDef = {
  name: 'hack',
  description: 'hack the mainframe (any key to stop): hack nasa',
  usage: 'hack [target]',
  group: 'fun',
  run: (ctx) => {
    const target = ctx.args.join(' ').trim() || 'the mainframe';
    startScreensaver('matrix', [
      `> tracing ${target} ...`,
      '> routed via 7 proxies and a smart toaster',
      "> password found: ******** (it was 'password')",
      '> decrypting ...',
      'ACCESS GRANTED',
    ]);
  },
};

export default command;
