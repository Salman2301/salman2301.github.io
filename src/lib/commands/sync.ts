import { get } from 'svelte/store';
import { commandHelp } from '../core/registry';
import { chooseFolder, disconnect, folderSupported, ISSUES_URL, pull, push, reconnect, setAuto, SYNC_FILE, syncState } from '../core/sync';
import type { CommandDef } from '../core/types';

function ago(ms: number): string {
  if (!ms) return 'never';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ms).toLocaleString();
}

const HELP = `
Sync keeps your tasks, notes, spaces and settings in one file,
${SYNC_FILE}, in a folder on your computer. Nothing is sent to a server.

To use it on several computers, pick a folder that a sync app shares:
iCloud Drive, Dropbox, Google Drive, OneDrive or Syncthing. Then run
"sync folder" on each computer and pick that same folder.

  sync folder      pick the folder (or a different one)
  sync             show what is synced and when
  sync push        write this browser's data to the folder now
  sync pull        load the folder's file into this browser (replaces what is here)
  sync auto off    stop syncing on its own (sync auto on starts again)
  sync connect     let the site use the folder again, if the browser asks
  sync off         stop syncing (the file stays in the folder)

How it works:
  - changes are written to the file a few seconds after you make them
  - when you open the site or come back to it, a newer file is loaded
  - if both this browser and the file changed, nothing is overwritten:
    you choose with "sync pull" or "sync push"
  - the browser may ask once per visit to use the folder again: click
    "sync folder" in the status bar

Works in Chrome, Edge, Brave and Opera on a computer. Safari, Firefox and
phones cannot open folders: use "backup" to save the file and
"backup import" to load it there.

Something wrong? Run "issue" or open ${ISSUES_URL}`;

const command: CommandDef = {
  name: 'sync',
  description: 'keep tasks, notes and settings in a folder you pick (iCloud, Dropbox, Drive…) to share them between computers',
  usage: 'sync [folder|push|pull|auto on|auto off|connect|off|help]',
  help: HELP,
  group: 'system',
  complete: (args) => (args.length <= 1 ? ['folder', 'push', 'pull', 'auto', 'connect', 'off', 'help'] : args[0] === 'auto' ? ['on', 'off'] : []),
  run: async (ctx) => {
    const [word = '', arg = ''] = ctx.args.map((a) => a.toLowerCase());
    const s = get(syncState);
    if (word === 'help') return ctx.print(commandHelp(command));
    try {
      if (word === 'folder' || word === 'setup' || word === 'choose') {
        if (!folderSupported()) {
          ctx.print('this browser cannot open folders. Use Chrome or Edge on a computer,', 'error');
          return ctx.print('or move your data by hand: "backup" saves a file, "backup import" loads it.', 'muted');
        }
        ctx.print('pick a folder (one inside iCloud Drive, Dropbox or Google Drive syncs between computers)…', 'muted');
        const r = await chooseFolder();
        if (r.existing) {
          ctx.print(`"${r.folder}" already has a workspace file with ${r.existing}.`, 'accent');
          return ctx.print('run "sync pull" to use it here, or "sync push" to replace it with this browser\'s data', 'accent');
        }
        return ctx.print(`syncing with the folder "${r.folder}" (${SYNC_FILE}). Changes save on their own.`, 'success');
      }
      if (!s.folder) {
        if (word) return ctx.print('no sync folder yet: run "sync folder" (or "sync help")', 'error');
        return ctx.print(HELP.trim());
      }
      if (word === 'push') {
        await push();
        return ctx.print(`saved to "${s.folder}"`, 'success');
      }
      if (word === 'pull') {
        ctx.print(`loading from "${s.folder}"…`, 'muted');
        await pull();
        return ctx.print('already the same as the folder', 'muted');
      }
      if (word === 'connect') {
        await reconnect();
        return ctx.print(`using "${s.folder}" again`, 'success');
      }
      if (word === 'auto') {
        if (arg !== 'on' && arg !== 'off') return ctx.print('usage: sync auto on|off', 'error');
        setAuto(arg === 'on');
        return ctx.print(arg === 'on' ? 'auto sync on: changes save to the folder, and newer data loads when you open the site' : 'auto sync off: use "sync push" and "sync pull"', 'success');
      }
      if (word === 'off' || word === 'stop') {
        await disconnect();
        return ctx.print(`sync off. ${SYNC_FILE} stays in the folder.`, 'success');
      }
      if (word && word !== 'status') return ctx.print(`usage: ${command.usage}`, 'error');
      ctx.print(`syncing with the folder "${s.folder}" · auto ${s.auto ? 'on' : 'off'} · last sync ${ago(s.lastSync)}`);
      if (!s.fileAt) ctx.print('choose a copy first: "sync pull" (use the folder\'s) or "sync push" (keep this one)', 'accent');
      else if (s.dirty) ctx.print('this browser has changes that are not in the folder yet', 'accent');
      ctx.print('sync help explains everything', 'muted');
    } catch (err) {
      ctx.print(`sync: ${(err as Error).message}`, 'error');
    }
  },
};

export default command;
