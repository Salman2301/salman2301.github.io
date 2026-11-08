import type { CommandDef } from '../core/types';
import { openWidget } from '../core/workspace';

const command: CommandDef = {
  name: 'embed',
  description: 'open a web page or a YouTube video in a new pane',
  usage: 'embed <url>',
  group: 'workspace',
  run: (ctx) => {
    let url = ctx.args[0];
    if (!url) return ctx.print('usage: embed <url>', 'error');
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try {
      new URL(url);
    } catch {
      return ctx.print(`"${ctx.args[0]}" is not a valid link`, 'error');
    }
    openWidget('embed', { url }, { reuse: false });
    ctx.print(`embedding ${url}`, 'muted');
  },
};

export default command;
