import { get } from 'svelte/store';
import { getWidget, widgets } from '../core/registry';
import type { CommandDef } from '../core/types';
import { allTemplates, applyTemplate, deleteTemplate, findTemplate, saveCurrentAsTemplate } from '../core/templates';
import { templatePickerOpen } from '../core/ui';
import { notify } from '../core/notify';
import {
  closePane,
  closeTab,
  focusPane,
  leaf,
  leaves,
  openWidget,
  shareUrl,
  splitPane,
  toggleMaximize,
  workspace,
} from '../core/workspace';
import WidgetList from '../terminal/output/WidgetList.svelte';

const widgetIds = () => widgets.filter((w) => !w.hidden).map((w) => w.id);

const commands: CommandDef[] = [
  {
    name: 'templates',
    aliases: ['template', 'layout', 'layouts'],
    description: 'pick a layout template (alt+t), or apply one: template study',
    usage: 'template [name] | template save <name> | template delete <name> | template list',
    group: 'workspace',
    complete: (args) =>
      args.length <= 1
        ? ['list', 'save', 'delete', ...allTemplates().map((t) => t.id)]
        : args[0] === 'delete'
          ? allTemplates()
              .filter((t) => t.custom)
              .map((t) => t.id)
          : [],
    run: (ctx) => {
      const [sub, ...rest] = ctx.args;
      if (!sub) {
        templatePickerOpen.set(true);
        return ctx.print('opened the template picker (esc to close)', 'muted');
      }
      if (sub === 'list') {
        const current = get(workspace).template;
        return ctx.print(
          allTemplates()
            .map((t) => `${t.id === current ? '*' : ' '} ${t.id.padEnd(12)} ${t.description}`)
            .join('\n'),
        );
      }
      if (sub === 'save') {
        const name = rest.join(' ').trim();
        if (!name) return ctx.print('usage: template save <name>', 'error');
        const id = saveCurrentAsTemplate(name);
        return id
          ? ctx.print(`saved current layout as "${id}"`, 'success')
          : ctx.print('that name is taken by a built-in template', 'error');
      }
      if (sub === 'delete' || sub === 'rm') {
        const id = rest[0];
        if (!id) return ctx.print('usage: template delete <name>', 'error');
        return deleteTemplate(id)
          ? ctx.print(`deleted template "${id}"`, 'muted')
          : ctx.print(`no custom template "${id}"`, 'error');
      }
      const t = findTemplate(sub);
      if (!t) return ctx.print(`no template "${sub}". Try "template list".`, 'error');
      applyTemplate(t.id);
      notify(`Template: ${t.title}`, { body: t.description });
    },
  },
  {
    name: 'open',
    aliases: ['widget', 'new'],
    description: 'open a widget in this terminal: open notes (--new opens a separate pane)',
    usage: 'open <widget> [--new]',
    group: 'workspace',
    complete: (args) => (args.length <= 1 ? widgetIds() : ['--new']),
    run: (ctx) => {
      const id = ctx.args[0];
      if (!id) return ctx.render(WidgetList);
      const def = getWidget(id);
      if (!def) return ctx.print(`no widget "${id}". Type "open" to list them.`, 'error');
      // Default: the widget takes over this terminal's pane. --new splits off another pane.
      const fresh = ctx.args.includes('--new');
      openWidget(def.id, def.defaultConfig, { from: ctx.paneId, replace: !fresh, reuse: false });
    },
  },
  {
    name: 'widgets',
    description: 'list available widgets',
    group: 'workspace',
    run: (ctx) => ctx.run('open'),
  },
  {
    name: 'split',
    aliases: ['vsplit', 'hsplit'],
    description: 'split this pane: split (right) or split down, optional widget',
    usage: 'split [right|down|h|v] [widget]',
    group: 'workspace',
    complete: (args) => (args.length <= 1 ? ['right', 'down', ...widgetIds()] : widgetIds()),
    run: (ctx) => {
      let dir: 'row' | 'column' = ctx.raw.startsWith('hsplit') ? 'column' : 'row';
      let widget = 'terminal';
      for (const a of ctx.args) {
        if (['down', 'v', 'vertical', 'below'].includes(a)) dir = 'column';
        else if (['right', 'h', 'horizontal', 'side'].includes(a)) dir = 'row';
        else if (getWidget(a)) widget = a;
        else return ctx.print(`unknown option "${a}"`, 'error');
      }
      const def = getWidget(widget);
      splitPane(ctx.paneId, dir, leaf(widget, def?.defaultConfig ?? (widget === 'terminal' ? { startup: [] } : {})));
    },
  },
  {
    name: 'exit',
    aliases: ['close', 'quit'],
    description: 'close this pane; the last pane closes its tab, and the last tab closes the window',
    group: 'workspace',
    run: (ctx) => {
      const s = get(workspace);
      if (leaves(s.root).length > 1) return closePane(ctx.paneId);
      if (s.tabs.length > 1) return void closeTab(s.active);
      // Last pane of the only tab: close the window. Browsers only allow this for windows
      // the page did not open, so say what to do when they refuse.
      window.close();
      ctx.print('this browser blocked the window from closing itself. Close the tab to leave.', 'muted');
    },
  },
  {
    name: 'max',
    aliases: ['maximize', 'zoom'],
    description: 'maximize or restore this pane (alt+m)',
    group: 'workspace',
    run: (ctx) => toggleMaximize(ctx.paneId),
  },
  {
    name: 'panes',
    aliases: ['windows'],
    description: 'list open panes, "panes 2" focuses pane 2',
    usage: 'panes [n]',
    group: 'workspace',
    run: (ctx) => {
      const all = leaves(get(workspace).root);
      const n = Number(ctx.args[0]);
      if (n && all[n - 1]) return focusPane(all[n - 1].id);
      ctx.print(
        all
          .map((p, i) => `${p.id === ctx.paneId ? '>' : ' '} ${i + 1}  ${(getWidget(p.widget)?.title ?? p.widget).toLowerCase()}`)
          .join('\n'),
      );
    },
  },
  {
    name: 'share',
    description: 'copy a link that recreates this exact layout',
    group: 'workspace',
    run: async (ctx) => {
      const url = shareUrl();
      try {
        await navigator.clipboard.writeText(url);
        ctx.print('link copied to the clipboard:', 'success');
      } catch {
        ctx.print('copy this link:', 'muted');
      }
      ctx.print(url, 'accent');
    },
  },
  {
    name: 'reset',
    description: 'reset the layout back to the classic terminal',
    usage: 'reset [--all]',
    group: 'workspace',
    complete: () => ['--all'],
    run: (ctx) => {
      if (ctx.args[0] === '--all') {
        try {
          Object.keys(localStorage)
            .filter((k) => k.startsWith('s2301:'))
            .forEach((k) => localStorage.removeItem(k));
        } catch {
          /* ignore */
        }
        location.reload();
        return;
      }
      applyTemplate('classic');
    },
  },
];

export default commands;
