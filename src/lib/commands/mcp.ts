import { get } from 'svelte/store';
import type { CommandDef } from '../core/types';
import { groupOf, TOOLS, webmcpLog, webmcpStatus } from '../core/webmcp';

const command: CommandDef = {
  name: 'mcp',
  aliases: ['webmcp'],
  description: 'the tools this page offers to an AI agent in the browser (WebMCP)',
  usage: 'mcp [log]',
  help: 'This page registers its tasks, notes, reminders, timer, music and layout as WebMCP tools.\nAn AI agent built into the browser can call them to read and change what is here.\nIt needs a browser with WebMCP (document.modelContext), such as a recent Chrome or Edge.\n\n  mcp       whether it is on, and the tools by group\n  mcp log   what an agent did here since the page was opened',
  group: 'system',
  complete: (args) => (args.length <= 1 ? ['log'] : []),
  run: (ctx) => {
    if (ctx.args[0] === 'log') {
      const log = get(webmcpLog);
      if (!log.length) return ctx.print('no agent has called a tool since the page was opened', 'muted');
      for (const c of log.slice(-40)) {
        const time = new Date(c.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        ctx.print(`${time}  ${c.tool}${c.detail ? `  ${c.detail}` : ''}`, c.ok ? 'normal' : 'error');
      }
      return;
    }
    const status = get(webmcpStatus);
    if (status === 'on') ctx.print(`WebMCP is on: ${TOOLS.length} tools offered to this browser's agent`, 'success');
    else if (status === 'error') ctx.print('this browser has WebMCP, but it refused the tools (see the console)', 'error');
    else ctx.print('this browser has no WebMCP, so no agent can see these tools yet', 'muted');
    const groups = new Map<string, string[]>();
    for (const t of TOOLS) groups.set(groupOf(t.name), [...(groups.get(groupOf(t.name)) ?? []), t.name]);
    const width = Math.max(...[...groups.keys()].map((g) => g.length));
    for (const [g, names] of groups) ctx.print(`  ${g.padEnd(width)}  ${names.join(', ')}`);
    ctx.print('"mcp log" shows what an agent did here', 'muted');
  },
};

export default command;
