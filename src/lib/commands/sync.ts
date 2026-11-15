import { get } from 'svelte/store';
import { CLOUD_URL } from '../core/cloud';
import { commandHelp } from '../core/registry';
import {
  chooseFolder,
  connectCloud,
  connectCloudAuto,
  connected,
  disconnect,
  folderSupported,
  ISSUES_URL,
  joinWorkspace,
  parseJoin,
  pull,
  push,
  reconnect,
  setAuto,
  shareLink,
  SYNC_FILE,
  syncState,
} from '../core/sync';
import SyncShare from '../terminal/output/SyncShare.svelte';
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
              share one copy. This browser makes its own token the first
              time; it stays here and never goes into a backup.

  sync folder                  pick a folder (or a different one)
  sync cloud                   use the sync server (makes a token if this
                               browser has none, so a new workspace)
  sync share                   show a QR code: scan it with a phone to join
  sync join [link]             join the workspace of a "sync share" link
                               (pasted, or read from the clipboard)
  sync cloud <address> [token] another server, or a token you already have
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
On iPhone and iPad, an app added to the home screen keeps its own data,
apart from Safari, so scanning the code syncs Safari only. Add the site to
the home screen, open it, then "sync join" with the link from "copy link".

Anyone with the token (or the QR code) can read and change your workspace,
so share it only with your own devices.

Something wrong? Run "issue" or open ${ISSUES_URL}`;

const command: CommandDef = {
  name: 'sync',
  description: 'keep tasks, notes and settings in a folder or on your own server, to share them between devices',
  usage: 'sync [folder|cloud|share|join|push|pull|auto on|auto off|connect|off|help]',
  help: HELP,
  group: 'system',
  complete: (args) => (args.length <= 1 ? ['folder', 'cloud', 'share', 'join', 'push', 'pull', 'auto', 'connect', 'off', 'help'] : args[0] === 'auto' ? ['on', 'off'] : []),
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
          ctx.print('or sync through the server: "sync cloud".', 'muted');
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
        if (!arg && s.kind === 'cloud') {
          ctx.print(`syncing with ${s.url} · revision ${s.rev} · auto ${s.auto ? 'on' : 'off'} · last sync ${ago(s.lastSync)}`);
          return ctx.print('"sync share" shows a QR code to add a phone', 'muted');
        }
        ctx.print(`checking ${arg || CLOUD_URL}…`, 'muted');
        const r = arg2 ? { ...(await connectCloud(arg, arg2)), made: false } : await connectCloudAuto(arg || undefined);
        if (r.made) ctx.print('made a new token for this browser: a new workspace on the server', 'muted');
        if (r.existing) {
          ctx.print(`the server already has a copy with ${r.existing}.`, 'accent');
          return ctx.print('run "sync pull" to use it here, or "sync push" to replace it with this browser\'s data', 'accent');
        }
        ctx.print(`syncing with ${r.folder}. Changes save on their own; other devices pick them up when you return to them.`, 'success');
        return ctx.print('"sync share" shows a QR code to add a phone', 'muted');
      }

      if (word === 'share' || word === 'qr') {
        if (s.kind !== 'cloud') {
          if (connected(s)) return ctx.print('this browser syncs with a folder, which a phone cannot open. "sync cloud" moves it to the server first.', 'error');
          ctx.print(`not on the server yet: connecting to ${CLOUD_URL}…`, 'muted');
          const r = await connectCloudAuto();
          if (r.existing) {
            ctx.print(`the server already has a copy with ${r.existing}.`, 'accent');
            return ctx.print('choose first: "sync pull" to use it here or "sync push" to keep this one, then "sync share" again', 'accent');
          }
        }
        const now = get(syncState);
        return ctx.render(SyncShare, { link: shareLink(now), server: new URL(now.url).host });
      }

      if (word === 'join') {
        let text = ctx.args.slice(1).join(' ');
        if (!text) {
          try {
            text = await navigator.clipboard.readText();
          } catch {
            /* no clipboard access: ask for the link below */
          }
        }
        const join = parseJoin(text);
        if (!join) {
          ctx.print('usage: sync join <link>', 'error');
          return ctx.print('on the other device run "sync share", press "copy link", and paste it here', 'muted');
        }
        ctx.print(`joining the workspace on ${new URL(join.server).host}…`, 'muted');
        const r = await joinWorkspace(join.token, join.server, () => false);
        if (r === 'same') return ctx.print('already syncing with that workspace', 'muted');
        if (r === 'kept') {
          ctx.print('connected. This device has its own tasks or notes, so nothing is replaced yet:', 'accent');
          return ctx.print('run "sync pull" to use the shared copy, or "sync push" to keep this one', 'accent');
        }
        return ctx.print(r === 'pulled' ? 'joined: loaded the shared workspace. Changes save on their own.' : 'joined: syncing with the shared workspace', 'success');
      }

      if (!connected(s)) {
        if (word) return ctx.print('no sync set up yet: run "sync cloud" or "sync folder" (or "sync help")', 'error');
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
