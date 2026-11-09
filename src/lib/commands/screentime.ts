import { get } from 'svelte/store';
import { getWidget } from '../core/registry';
import { formatDuration, lastDays, screenTime } from '../core/screentime';
import type { CommandDef } from '../core/types';
import { openWidget } from '../core/workspace';

const command: CommandDef = {
  name: 'screentime',
  aliases: ['usage'],
  description: 'how long you used the site today and this week (screentime open for the chart)',
  usage: 'screentime [open]',
  group: 'widgets',
  complete: (args) => (args.length <= 1 ? ['open'] : []),
  run: (ctx) => {
    if (ctx.args[0] === 'open') return void openWidget('screentime', undefined, { from: ctx.paneId });
    const week = lastDays(get(screenTime), 7);
    const today = week[week.length - 1].day;
    const total = week.reduce((a, d) => a + d.day.total, 0);
    const widgets = Object.entries(today.widgets).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const lines = [
      `today       ${formatDuration(today.total)}`,
      `this week   ${formatDuration(total)}  (about ${formatDuration(total / 7)} a day)`,
      ...(widgets.length ? ['', 'today by widget:', ...widgets.map(([id, s]) => `  ${(getWidget(id)?.title ?? id).padEnd(14)} ${formatDuration(s)}`)] : []),
    ];
    ctx.print(lines.join('\n'));
    ctx.print('screentime open shows the charts', 'muted');
  },
};

export default command;
