import { downloadBackup, parseBackup, pickFile, restore, snapshot, summarize } from '../core/backup';
import type { CommandDef } from '../core/types';

const command: CommandDef = {
  name: 'backup',
  description: 'save everything (tasks, notes, spaces, settings) to a file, or load one',
  usage: 'backup [export|import|info]',
  help: `
  backup           save everything to a file (salman2301-backup-<date>.json)
  backup import    load a backup file: replaces everything in this browser
  backup info      how much is stored here

Everything means tasks, notes, spaces, themes, layout, scores and history.
It all lives only in this browser, so save a backup before clearing site data
or moving to another computer. To keep two computers in step on their own,
see "sync --help".`,
  group: 'system',
  complete: (args) => (args.length <= 1 ? ['export', 'import', 'info'] : []),
  run: async (ctx) => {
    const word = (ctx.args[0] ?? 'export').toLowerCase();
    if (word === 'export' || word === 'save') {
      const b = snapshot();
      const name = downloadBackup();
      ctx.print(`saved ${name}: ${summarize(b)}`, 'success');
      return ctx.print('load it on any browser with: backup import', 'muted');
    }
    if (word === 'info') {
      const b = snapshot();
      const kb = Math.ceil(JSON.stringify(b).length / 1024);
      return ctx.print(`this browser holds ${summarize(b)} (${Object.keys(b.data).length} settings, ${kb} KB)`);
    }
    if (word === 'import' || word === 'load' || word === 'restore') {
      ctx.print('choose a backup file…', 'muted');
      const text = await pickFile();
      if (!text) return ctx.print('no file chosen', 'muted');
      const b = parseBackup(text);
      if (!b) return ctx.print('that file is not a backup from this site', 'error');
      const when = new Date(b.exportedAt).toLocaleString();
      const ok = window.confirm(`Replace everything in this browser with the backup from ${when}?\n\nIt has ${summarize(b)}. What is here now is lost unless you saved it.`);
      if (!ok) return ctx.print('kept everything as it was', 'muted');
      restore(b);
      ctx.print('restored, reloading…', 'success');
      setTimeout(() => location.reload(), 300);
      return;
    }
    ctx.print(`usage: ${command.usage}`, 'error');
  },
};

export default command;
