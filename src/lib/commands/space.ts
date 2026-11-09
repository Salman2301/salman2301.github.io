import { get } from 'svelte/store';
import { activeSpace, ALL, setActiveSpace } from '../core/spaces';
import { addProject, projects } from '../core/tasks';
import type { CommandDef } from '../core/types';

/** Spaces group tasks and notes; the active one filters them (and can set the theme). */
const command: CommandDef = {
  name: 'space',
  aliases: ['spaces'],
  description: 'switch space (filters tasks, notes, reminders): space work, space all, space new <name>',
  usage: 'space [<name>|all|list|new <name>]',
  group: 'workspace',
  complete: (args) => (args.length <= 1 ? ['all', 'list', 'new', ...get(projects).map((p) => p.name.toLowerCase())] : []),
  run: (ctx) => {
    const [sub, ...rest] = ctx.args;
    const list = get(projects);
    if (!sub || sub === 'list' || sub === 'ls') {
      const active = get(activeSpace);
      const lines = [`${active === ALL ? '*' : ' '} all`, ...list.map((p) => `${active === p.id ? '*' : ' '} ${p.name}${p.theme ? `  (theme: ${p.theme})` : ''}`)];
      return ctx.print(`spaces:\n${lines.join('\n')}\n(space <name> to switch; themes and renames in the status bar menu)`);
    }
    if (sub === 'all') {
      setActiveSpace(ALL);
      return ctx.print('showing all spaces', 'muted');
    }
    if (sub === 'new') {
      const p = addProject(rest.join(' '));
      if (!p) return ctx.print('usage: space new <name>', 'error');
      setActiveSpace(p.id);
      return ctx.print(`created and switched to ${p.name}`, 'success');
    }
    const q = ctx.args.join(' ').trim().toLowerCase();
    const hit = list.find((p) => p.name.toLowerCase() === q) ?? list.find((p) => p.name.toLowerCase().startsWith(q));
    if (!hit) return ctx.print(`no space "${q}". Try "space list" or "space new ${q}".`, 'error');
    setActiveSpace(hit.id);
    ctx.print(`space: ${hit.name}`, 'muted');
  },
};

export default command;
