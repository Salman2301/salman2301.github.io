import { get } from 'svelte/store';
import { CLOUD_URL } from '../core/cloud';
import { commandHelp } from '../core/registry';
import {
  chooseFolder,
  connectCloud,
  connected,
  disconnect,
  folderSupported,
  ISSUES_URL,
  pull,
  push,
  reconnect,
  setAuto,
  SYNC_FILE,
  syncState,
} from '../core/sync';
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
${SYNC_FILE}, so every device you use shares the same copy.
Two places work:

  a folder    a folder you pick on this computer. Put it in iCloud Drive,
              Dropbox, Google Drive, OneDrive or Syncthing, and every
              computer that picks it shares your data. Yours alone: nothing
              is sent to a server. Chrome, Edge, Brave and Opera on a
              computer only.
  the server  the Worker in this repo (worker/), so phones and computers
              share one copy. It asks for a token, which stays in this
              browser and never goes into a backup.

  sync folder                  pick a folder (or a different one)
  sync cloud <address> <token> use the sync server
  sync                         show what is synced and when
  sync push                    write this browser's data there now
  sync pull                    load the other copy here (replaces what is here)
  sync auto off                stop syncing on its own (sync auto on starts again)
  sync connect                 use the folder again, if the browser asks
  sync off                     stop syncing (the copy stays where it is)

How it works:
  - changes are written a few seconds after you make them
  - when you open the site or come back to it, newer data is loaded
  - if both this browser and the other copy changed, nothing is overwritten:
    you choose with "sync pull" or "sync push"
  - a folder may ask once per visit to use the folder again: click
    "sync folder" in the status bar

The default server is ${CLOUD_URL}
The token is printed when it is made (see worker/README.md). Anyone with it
can read and change your workspace, so keep it to your own devices.

Something wrong? Run "issue" or open ${ISSUES_URL}`;

const command: CommandDef = {
  name: 'sync',
  description: 'keep tasks, notes and settings in a folder or on your own server, to share them between devices',
  usage: 'sync [folder|cloud|push|pull|auto on|auto off|connect|off|help]',
  help: HELP,
  group: 'system',
  complete: (args) => (args.length <= 1 ? ['folder', 'cloud', 'push', 'pull', 'auto', 'connect', 'off', 'help'] : args[0] === 'auto' ? ['on', 'off'] : []),
  run: async (ctx) => {
    // Commands are case-insensitive, but a token is not: only the words fold.
    const [name = '', arg = '', arg2 = ''] = ctx.args;
    const word = name.toLowerCase();
    const sub = arg.toLowerCase();
    const s = get(syncState);
    if (word === 'help') return ctx.print(commandHelp(command));
    try {
      if (word === 'folder' || word === 'setup' || word === 'choose') {
        if (!folderSupported()) {
          ctx.print('this browser cannot open folders. Use Chrome or Edge on a computer,', 'error');
          ctx.print('or sync through the server: "sync cloud <address> <token>".', 'muted');
          return ctx.print('(or move your data by hand: "backup" saves a file, "backup import" loads it)', 'muted');
        }
        ctx.print('pick a folder (one inside iCloud Drive, Dropbox or Google Drive syncs between computers)…', 'muted');
        const r = await chooseFolder();
        if (r.existing) {
          ctx.print(`"${r.folder}" already has a workspace file with ${r.existing}.`, 'accent');
          return ctx.print('run "sync pull" to use it here, or "sync push" to replace it with this browser\'s data', 'accent');
        }
        return ctx.print(`syncing with the folder "${r.folder}" (${SYNC_FILE}). Changes save on their own.`, 'success');
      }

      if (word === 'cloud' || word === 'server') {
        if (!arg) {
          if (s.kind === 'cloud') return ctx.print(`syncing with ${s.url} · revision ${s.rev} · auto ${s.auto ? 'on' : 'off'} · last sync ${ago(s.lastSync)}`);
          ctx.print(`usage: sync cloud <address> <token>`, 'muted');
          return ctx.print(`the server in this repo is at ${CLOUD_URL}`, 'muted');
        }
        if (!arg2) return ctx.print('the token is missing: "sync cloud <address> <token>" (see worker/README.md)', 'error');
        ctx.print(`checking ${arg}…`, 'muted');
        const r = await connectCloud(arg, arg2);
        if (r.existing) {
          ctx.print(`the server already has a copy with ${r.existing}.`, 'accent');
          return ctx.print('run "sync pull" to use it here, or "sync push" to replace it with this browser\'s data', 'accent');
        }
        return ctx.print(`syncing with ${r.folder}. Changes save on their own; other devices pick them up when you return to them.`, 'success');
      }

      if (!connected(s)) {
        if (word) return ctx.print('no sync set up yet: run "sync folder" or "sync cloud <address> <token>" (or "sync help")', 'error');
        return ctx.print(HELP.trim());
      }
      if (word === 'push') {
        await push();
        return ctx.print(`saved to ${s.kind === 'cloud' ? s.url : `"${s.folder}"`}`, 'success');
      }
      if (word === 'pull') {
        ctx.print(`loading from ${s.kind === 'cloud' ? s.url : `"${s.folder}"`}…`, 'muted');
        await pull();
        return ctx.print('already the same as the other copy', 'muted');
      }
      if (word === 'connect') {
        await reconnect();
        return ctx.print(s.kind === 'cloud' ? `using ${s.url} again` : `using "${s.folder}" again`, 'success');
      }
      if (word === 'auto') {
        if (sub !== 'on' && sub !== 'off') return ctx.print('usage: sync auto on|off', 'error');
        setAuto(sub === 'on');
        return ctx.print(arg === 'on' ? 'auto sync on: changes save on their own, and newer data loads when you open the site' : 'auto sync off: use "sync push" and "sync pull"', 'success');
      }
      if (word === 'off' || word === 'stop') {
        await disconnect();
        return ctx.print(`sync off. ${s.kind === 'cloud' ? 'The copy stays on the server.' : `${SYNC_FILE} stays in the folder.`}`, 'success');
      }
      if (word && word !== 'status') return ctx.print(`usage: ${command.usage}`, 'error');
      const where = s.kind === 'cloud' ? s.url : `the folder "${s.folder}"`;
      ctx.print(`syncing with ${where} · auto ${s.auto ? 'on' : 'off'} · last sync ${ago(s.lastSync)}`);
      if (s.kind === 'cloud') ctx.print(`server revision ${s.rev}${s.rev ? '' : ' (nothing written yet)'}`, 'muted');
      if (!s.fileAt) ctx.print('choose a copy first: "sync pull" (use the other one) or "sync push" (keep this one)', 'accent');
      else if (s.dirty) ctx.print('this browser has changes that are not saved there yet', 'accent');
      ctx.print('sync help explains everything', 'muted');
    } catch (err) {
      ctx.print(`sync: ${(err as Error).message}`, 'error');
    }
  },
};

export default command;
