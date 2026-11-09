import { get } from 'svelte/store';
import { isSaverId, saverPrefs, SAVERS, startScreensaver } from '../core/screensaver';
import type { CommandDef } from '../core/types';

const command: CommandDef = {
  name: 'screensaver',
  aliases: ['saver', 'ss'],
  description: 'animation in your theme over this pane (alt+s): matrix, stars, pipes, bounce; idle <minutes>',
  usage: 'screensaver [matrix|stars|pipes|bounce|random|list|idle <minutes>|idle off]',
  group: 'fun',
  complete: (args) => (args.length <= 1 ? [...SAVERS.map((s) => s.id), 'random', 'list', 'idle'] : args[0] === 'idle' ? ['off', '5', '10', '15', '30'] : []),
  run: (ctx) => {
    const [sub, arg] = ctx.args;
    const prefs = get(saverPrefs);
    if (sub === 'list' || sub === 'ls') {
      const lines = SAVERS.map((s) => `${s.id === prefs.id ? '*' : ' '} ${s.id.padEnd(8)} ${s.title}`);
      return ctx.print(
        `screensavers:\n${lines.join('\n')}\nidle: ${prefs.idleMinutes ? `after ${prefs.idleMinutes} min` : 'off'} (screensaver idle <minutes> | idle off)`,
      );
    }
    if (sub === 'idle') {
      if (!arg) return ctx.print(`idle: ${prefs.idleMinutes ? `after ${prefs.idleMinutes} min` : 'off'}`, 'muted');
      const minutes = arg === 'off' ? 0 : Math.round(Number(arg));
      if (!Number.isFinite(minutes) || minutes < 0 || minutes > 240) return ctx.print('usage: screensaver idle <1-240 minutes> | idle off', 'error');
      saverPrefs.update((p) => ({ ...p, idleMinutes: minutes }));
      return ctx.print(minutes ? `screensaver starts after ${minutes} idle minutes` : 'idle screensaver off', 'success');
    }
    if (sub && sub !== 'random' && !isSaverId(sub)) {
      return ctx.print(`no screensaver "${sub}". Try: ${SAVERS.map((s) => s.id).join(', ')}, random`, 'error');
    }
    if (isSaverId(sub)) saverPrefs.update((p) => ({ ...p, id: sub }));
    startScreensaver(sub === 'random' ? 'random' : isSaverId(sub) ? sub : undefined, undefined, ctx.paneId);
  },
};

export default command;
