import { get } from 'svelte/store';
import type { CommandDef } from '../core/types';
import { closeTab, newTab, renameTab, stepTab, switchTab, workspace } from '../core/workspace';

const find = (needle: string) => {
  const s = get(workspace);
  const byNum = Number(needle);
  if (Number.isInteger(byNum) && byNum >= 1 && byNum <= s.tabs.length) return s.tabs[byNum - 1];
  return s.tabs.find((t) => t.name.toLowerCase() === needle.toLowerCase());
};

const command: CommandDef = {
  name: 'tab',
  aliases: ['tabs', 'window', 'windows'],
  description: 'tabs (zellij-style windows): list, new, go, next, prev, rename, close',
  usage: 'tab [list | new [name] | go <n|name> | next | prev | rename <name> | close [n|name]]',
  group: 'workspace',
  complete: (args) => (args.length <= 1 ? ['list', 'new', 'go', 'next', 'prev', 'rename', 'close'] : []),
  run: (ctx) => {
    const [sub = 'list', ...rest] = ctx.args;
    const s = get(workspace);
    if (sub === 'list') {
      return ctx.print(
        s.tabs.map((t, i) => `${t.id === s.active ? '*' : ' '} ${i + 1}  ${t.name}`).join('\n') +
          '\nalt+n new · alt+[ / alt+] switch · double-click a tab to rename',
      );
    }
    if (sub === 'new') {
      newTab(rest.join(' ') || undefined);
      return ctx.print(`opened tab ${get(workspace).tabs.length}`, 'muted');
    }
    if (sub === 'next' || sub === 'prev') return stepTab(sub === 'next' ? 1 : -1);
    if (sub === 'go') {
      const t = find(rest.join(' '));
      if (!t) return ctx.print('usage: tab go <number|name>', 'error');
      return switchTab(t.id);
    }
    if (sub === 'rename') {
      const name = rest.join(' ').trim();
      if (!name) return ctx.print('usage: tab rename <name>', 'error');
      return renameTab(s.active, name);
    }
    if (sub === 'close') {
      const t = rest.length ? find(rest.join(' ')) : s.tabs.find((x) => x.id === s.active);
      if (!t) return ctx.print('no such tab', 'error');
      if (!closeTab(t.id)) return ctx.print('the last tab cannot be closed', 'error');
      return;
    }
    return ctx.print(`unknown tab command "${sub}". Try "tab list".`, 'error');
  },
};

export default command;
