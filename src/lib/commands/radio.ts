import type { CommandDef } from '../core/types';
import { openWidget } from '../core/workspace';
import { findStation, STATIONS } from '../widgets/radio/stations';
import { pause, stepStation, tune } from '../widgets/radio/player';

const command: CommandDef = {
  name: 'radio',
  description: 'tune in to a free live radio station, or stop the radio',
  usage: 'radio [<station>|next|prev|list|stop]',
  group: 'widgets',
  complete: (args) => (args.length <= 1 ? [...STATIONS.map((s) => s.slug), 'next', 'prev', 'list', 'stop'] : []),
  run: (ctx) => {
    const word = ctx.args.join(' ').trim().toLowerCase();
    if (!word) return void openWidget('radio', undefined, { from: ctx.paneId });
    if (word === 'next' || word === 'prev' || word === 'previous') {
      const st = stepStation(word === 'next' ? 1 : -1);
      return ctx.print(`tuning in to ${st.name}`, 'success');
    }
    if (word === 'stop' || word === 'pause') {
      pause();
      return ctx.print('radio stopped', 'muted');
    }
    if (word === 'list' || word === 'ls') {
      const width = Math.max(...STATIONS.map((s) => s.slug.length)) + 2;
      const lines = STATIONS.map((s) => `  ${s.slug.padEnd(width)}${s.name}  ·  ${s.note}`);
      return ctx.print(`stations (radio <station>):\n${lines.join('\n')}`);
    }
    const station = findStation(word);
    if (!station) {
      ctx.print(`no station called "${word}"`, 'error');
      return ctx.print(`try: radio ${STATIONS[0].slug}   or radio list`, 'muted');
    }
    tune(station);
    openWidget('radio', undefined, { from: ctx.paneId });
    ctx.print(`tuning in to ${station.name}`, 'success');
  },
};

export default command;
