import { get } from 'svelte/store';
import { parseBackup, restore, snapshot, summarize, type Backup } from './backup';
import * as cloud from './cloud';
import { notify } from './notify';
import { isInstalled } from './pwa';
import { setStatus } from './status';
import { onStorageChange, persisted } from './storage';

/**
 * Sync: everything this site keeps (the same data as a backup) is written to
 * one file, salman2301-workspace.json, and every device that points at the
 * same place shares your tasks, notes and settings. Two places work:
 *
 * - a folder you pick on this computer (`sync folder`): put it in iCloud
 *   Drive, Dropbox, Google Drive, OneDrive or Syncthing. Needs the File System
 *   Access API, so desktop Chromium only, and nothing goes to a server of ours.
 * - the Worker in `worker/` (`sync cloud`, `sync share`): works on phones
 *   too, and is the one to use when a folder is not an option.
 *
 * Either way:
 * - changes are written a few seconds after you make them
 * - when the page opens or comes back into view, newer data (written by
 *   another device) is loaded, unless this browser has unsaved changes of its
 *   own: then you choose with `sync pull` or `sync push`
 *
 * Elsewhere `backup` and `backup import` move the same file by hand.
 */

export const SYNC_FILE = 'salman2301-workspace.json';
export const ISSUES_URL = 'https://github.com/Salman2301/salman2301.github.io/issues';

export interface SyncState {
  /** Where it syncs: a folder, our Worker, or nowhere yet. */
  kind: '' | 'folder' | 'cloud';
  /** The folder's name, or the server's host, for display. */
  folder: string;
  /** The server, when `kind` is cloud. */
  url: string;
  /** The server's token. Kept in a `sync:` key, so it never rides in a backup. */
  token: string;
  /** The server revision this browser last wrote or read. */
  rev: number;
  auto: boolean;
  /** lastModified of the file, or updatedAt on the server, after our last write or read. */
  fileAt: number;
  /** Local changes not written yet. */
  dirty: boolean;
  /** Last successful write or read (ms). */
  lastSync: number;
}

/**
 * The last server and token this browser used. Kept apart from the sync state
 * so "sync off" then "sync cloud" finds the same workspace again instead of
 * making a new one. A `sync:` key, so it never rides in a backup either.
 */
const lastCloud = persisted<{ url: string; token: string }>('sync:cloud', { url: '', token: '' }, 0);

const EMPTY: SyncState = { kind: '', folder: '', url: '', token: '', rev: 0, auto: true, fileAt: 0, dirty: false, lastSync: 0 };
export const syncState = persisted<SyncState>('sync:folder', EMPTY, 0);
const patch = (p: Partial<SyncState>) => syncState.update((s) => ({ ...s, ...p }));

/** A folder picked before `kind` existed is still a folder. */
const kindOf = (s: SyncState): '' | 'folder' | 'cloud' => (s.kind ? s.kind : s.folder ? 'folder' : '');

/** Whether anything is set up. */
export const connected = (s: SyncState = get(syncState)) => (kindOf(s) === 'cloud' ? !!(s.url && s.token) : !!s.folder);

/** Keys that change on their own all the time; they ride along but do not count as "you changed something". */
const QUIET = /^(sync:|screentime:|pomodoro:state|timer:|radio$|reminders:fired|terminal:history|workspace:)/;

export class SyncError extends Error {}

/* ------------------------------------------------- File System Access types */

type Mode = { mode: 'readwrite' };
interface Writable {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}
interface FileHandle {
  getFile(): Promise<File>;
  createWritable(): Promise<Writable>;
}
interface DirHandle {
  name: string;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileHandle>;
  queryPermission(opts: Mode): Promise<PermissionState>;
  requestPermission(opts: Mode): Promise<PermissionState>;
}
type PickerWindow = Window & { showDirectoryPicker?: (opts?: { id?: string; mode?: 'readwrite'; startIn?: string }) => Promise<DirHandle> };

/** Whether this browser can sync with a folder. */
export function folderSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as PickerWindow).showDirectoryPicker === 'function';
}

/* --------------------------------------- the folder handle lives in IndexedDB */

const DB = 's2301-sync';
const STORE = 'handles';

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const d = await db();
  return new Promise<T>((resolve, reject) => {
    const req = fn(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

let handle: DirHandle | null = null;

/**
 * Set while a pull replaces this browser's data. Restoring writes every key,
 * which the change hook would otherwise read as "the user edited something";
 * the page reloads right after, and the new page would push the copy back.
 */
let restoring = false;

async function savedHandle(): Promise<DirHandle | null> {
  if (handle) return handle;
  try {
    handle = (await idb<DirHandle | undefined>('readonly', (s) => s.get('folder'))) ?? null;
  } catch {
    handle = null;
  }
  return handle;
}

/* ------------------------------------------------------------- reading */

/** Same data, same text: used to skip loads and saves that would change nothing. */
// Keys that change on their own (screen time, terminal history, ...) are left
// out: two copies that differ only there hold the same work, so no "choose a
// copy" for them.
const dataKey = (b: Backup) => JSON.stringify(Object.keys(b.data).sort().filter((k) => !QUIET.test(k)).map((k) => [k, b.data[k]]));

/** The folder, with permission to write. `ask` may show the browser's prompt (needs a click). */
async function folder(ask: boolean): Promise<DirHandle> {
  const h = await savedHandle();
  if (!h) throw new SyncError('no sync folder yet: run "sync folder"');
  let perm = await h.queryPermission({ mode: 'readwrite' });
  if (perm === 'prompt' && ask) perm = await h.requestPermission({ mode: 'readwrite' });
  if (perm !== 'granted') throw new SyncError('the browser needs your OK to use the sync folder again: click "sync folder" in the status bar or run "sync connect"');
  return h;
}

async function readFile(h: DirHandle): Promise<{ backup: Backup; at: number } | null> {
  let file: File;
  try {
    file = await (await h.getFileHandle(SYNC_FILE)).getFile();
  } catch {
    return null; // not there yet
  }
  const backup = parseBackup(await file.text());
  if (!backup) throw new SyncError(`${SYNC_FILE} in the folder is not a workspace backup`);
  return { backup, at: file.lastModified };
}

/* ------------------------------------------------------------- actions */

export interface ConnectResult {
  folder: string;
  /** The folder already had a workspace file with other data: the user picks which copy wins. */
  existing?: string;
}

/**
 * Pick the sync folder (shows the folder picker; call from a click or a
 * command). An empty folder gets this browser's data right away.
 */
export async function chooseFolder(): Promise<ConnectResult> {
  const pick = (window as PickerWindow).showDirectoryPicker;
  if (!pick) throw new SyncError('this browser cannot open folders: use Chrome or Edge on a computer, or "backup" and "backup import"');
  let h: DirHandle;
  try {
    h = await pick({ id: 's2301-sync', mode: 'readwrite', startIn: 'documents' });
  } catch {
    throw new SyncError('no folder chosen');
  }
  handle = h;
  await idb('readwrite', (s) => s.put(h, 'folder'));
  patch({ kind: 'folder', folder: h.name, url: '', token: '', rev: 0, fileAt: 0, dirty: true });
  const found = await readFile(h);
  if (found && dataKey(found.backup) !== dataKey(snapshot())) {
    // Wait for the user's choice: neither side is overwritten yet.
    return { folder: h.name, existing: summarize(found.backup) };
  }
  await push();
  return { folder: h.name };
}

/**
 * Point this browser at a sync server (`worker/` in this repo) and take its
 * copy. When the server already has other data, nothing is written until the
 * user picks: `sync pull` or `sync push`.
 */
export async function connectCloud(address: string, token: string): Promise<ConnectResult> {
  const url = cloud.baseUrl(address);
  const clean = token.trim();
  if (!clean) throw new SyncError('no token: run "sync cloud"');
  await cloud.check(url, clean);
  const remote = await cloud.read(url, clean);
  const label = new URL(url).host;
  lastCloud.set({ url, token: clean });
  patch({ kind: 'cloud', folder: label, url, token: clean, rev: remote?.rev ?? 0, fileAt: remote ? remote.updatedAt : 0, dirty: true });
  if (remote && dataKey(remote.doc) !== dataKey(snapshot())) {
    // Two copies, one choice: neither side is written yet.
    patch({ fileAt: 0 });
    return { folder: label, existing: summarize(remote.doc) };
  }
  if (remote) {
    patch({ dirty: false, lastSync: Date.now() });
    return { folder: label };
  }
  await pushCloud();
  return { folder: label };
}

/**
 * Write this browser's data to the folder. `auto` is set by the timers: then a
 * file that changed since this browser last synced is not overwritten; the
 * user decides with `sync pull` or `sync push`.
 */
export async function push(ask = true, auto = false): Promise<void> {
  const state = get(syncState);
  if (kindOf(state) === 'cloud') return pushCloud(auto);
  const h = await folder(ask);
  if (auto) {
    let cur: File | null = null;
    try {
      cur = await (await h.getFileHandle(SYNC_FILE)).getFile();
    } catch {
      cur = null; // not there: writing creates it
    }
    if (cur && cur.lastModified !== get(syncState).fileAt) return newerNotice();
  }
  const fh = await h.getFileHandle(SYNC_FILE, { create: true });
  const w = await fh.createWritable();
  await w.write(JSON.stringify(snapshot(), null, 1));
  await w.close();
  const at = (await fh.getFile()).lastModified;
  patch({ fileAt: at, dirty: false, lastSync: Date.now() });
  setStatus('sync', null);
}

/** Replace this browser's data with the folder's file, then reload. */
export async function pull(ask = true): Promise<void> {
  if (kindOf(get(syncState)) === 'cloud') return pullCloud();
  const h = await folder(ask);
  const found = await readFile(h);
  if (!found) throw new SyncError(`there is no ${SYNC_FILE} in the folder yet: run "sync push"`);
  const next: SyncState = { ...get(syncState), fileAt: found.at, dirty: false, lastSync: Date.now() };
  if (dataKey(found.backup) === dataKey(snapshot())) {
    syncState.set(next);
    return;
  }
  restoring = true;
  restore(found.backup);
  try {
    // storage is frozen once restore starts: write the sync state by hand
    localStorage.setItem('s2301:sync:folder', JSON.stringify(next));
    sessionStorage.setItem('s2301:synced', summarize(found.backup));
  } catch {
    /* ignore */
  }
  location.reload();
}

/* ------------------------------------------------------------ the server */

/** A short label for this device, for the server's revision list. */
function deviceName(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const system = /iPhone|iPad|iPod/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'device';
  const browser = /Firefox/.test(ua) ? 'Firefox' : /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'browser';
  return `${system} · ${browser}`;
}

/**
 * Write to the server. `auto` runs from the timer: when another device wrote
 * in between, it only says so. A person who typed `sync push` means it.
 */
async function pushCloud(auto = false): Promise<void> {
  const s = get(syncState);
  if (!s.url || !s.token) throw new SyncError('no cloud sync yet: run "sync cloud"');
  let res = await cloud.write(s.url, s.token, s.rev, snapshot(), deviceName());
  if ('conflict' in res) {
    if (auto) return newerNotice();
    res = await cloud.write(s.url, s.token, s.rev, snapshot(), deviceName(), true);
    if ('conflict' in res) throw new SyncError('the server changed again while saving: run "sync push" once more');
  }
  patch({ rev: res.rev, fileAt: res.updatedAt, dirty: false, lastSync: Date.now() });
  setStatus('sync', null);
}

/** Replace this browser's data with the server's copy, then reload. */
async function pullCloud(): Promise<void> {
  const s = get(syncState);
  if (!s.url || !s.token) throw new SyncError('no cloud sync yet: run "sync cloud"');
  const remote = await cloud.read(s.url, s.token);
  if (!remote) throw new SyncError('nothing is on the server yet: run "sync push"');
  const next = { rev: remote.rev, fileAt: remote.updatedAt, dirty: false, lastSync: Date.now() };
  if (dataKey(remote.doc) === dataKey(snapshot())) {
    patch(next);
    return;
  }
  restoring = true;
  restore(remote.doc);
  try {
    // storage is frozen once restore starts: write the sync state by hand
    localStorage.setItem('s2301:sync:folder', JSON.stringify({ ...get(syncState), ...next }));
    sessionStorage.setItem('s2301:synced', summarize(remote.doc));
  } catch {
    /* ignore */
  }
  location.reload();
}

/** Load a newer revision from the server, when this browser has nothing unsaved. */
async function checkCloud(): Promise<void> {
  const s = get(syncState);
  if (!s.url || !s.token || !s.auto) return;
  if (Date.now() - lastCheck < 5000) return;
  lastCheck = Date.now();
  let remote: Awaited<ReturnType<typeof cloud.read>>;
  try {
    remote = await cloud.read(s.url, s.token);
  } catch (err) {
    return failed(err);
  }
  if (!remote || remote.rev <= s.rev) return;
  if (dataKey(remote.doc) === dataKey(snapshot())) return patch({ rev: remote.rev, fileAt: remote.updatedAt });
  if (get(syncState).dirty) return newerNotice();
  await pullCloud().catch(failed);
}

/**
 * Sync with a server without typing a token: this browser's last one, or a
 * new one (a new, empty workspace on the server that this browser fills).
 * `address` defaults to the last server, then CLOUD_URL.
 */
export async function connectCloudAuto(address?: string): Promise<ConnectResult & { made: boolean }> {
  const last = get(lastCloud);
  const url = cloud.baseUrl(address || last.url || cloud.CLOUD_URL);
  const reuse = last.token && (!address || cloud.baseUrl(last.url || cloud.CLOUD_URL) === url);
  const token = reuse ? last.token : cloud.newToken();
  return { ...(await connectCloud(url, token)), made: !reuse };
}

/**
 * The link that puts another device on this browser's server workspace. The
 * token rides in the #fragment, which browsers never send to a server; the
 * site reads it on load (joinFromLink) and takes it out of the address bar.
 */
export function shareLink(s: SyncState = get(syncState)): string {
  if (kindOf(s) !== 'cloud' || !s.token) throw new SyncError('not syncing with a server: run "sync cloud" first');
  const p = new URLSearchParams({ sync: s.token });
  if (cloud.baseUrl(s.url) !== cloud.CLOUD_URL) p.set('server', s.url);
  return `${location.origin}${location.pathname}#${p}`;
}

/** Whether this browser holds tasks or notes of its own (not just the welcome note). */
function hasOwnData(): boolean {
  const d = snapshot().data as Record<string, unknown>;
  const list = (k: string) => (Array.isArray(d[k]) ? (d[k] as unknown[]) : []);
  return list('tasks:list').length > 0 || list('notes:list').some((n) => (n as { id?: string }).id !== 'welcome');
}

/** The token and server in a "sync share" link, or a bare token. Null when it is neither. */
export function parseJoin(text: string, server?: string): { token: string; server: string } | null {
  const t = text.trim();
  const at = t.indexOf('sync=');
  if (at >= 0) {
    const p = new URLSearchParams(t.slice(at));
    const token = p.get('sync') ?? '';
    return token ? { token, server: p.get('server') || server || cloud.CLOUD_URL } : null;
  }
  return /^[A-Za-z0-9_-]{16,}$/.test(t) ? { token: t, server: server || cloud.CLOUD_URL } : null;
}

export type JoinResult = 'same' | 'joined' | 'pulled' | 'kept';

/**
 * Join the workspace of a "sync share" link. A browser with nothing of its
 * own takes the shared copy straight away; one with its own tasks or notes
 * is asked first (`ask`), since taking the copy replaces them. Without
 * `ask` it is left for "sync pull" or "sync push".
 */
export async function joinWorkspace(token: string, server: string, ask: (existing: string) => boolean): Promise<JoinResult> {
  const s = get(syncState);
  if (kindOf(s) === 'cloud' && s.token === token && cloud.baseUrl(s.url) === cloud.baseUrl(server)) return 'same';
  const r = await connectCloud(server, token);
  if (!r.existing) return 'joined';
  if (hasOwnData() && !ask(r.existing)) return 'kept';
  await pull(false);
  return 'pulled';
}

/** On iPhone and iPad a site added to the home screen keeps its own data, apart from Safari. */
export function separateAppStorage(): boolean {
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios && !isInstalled();
}

/** Opened from a "sync share" link: join that workspace. */
async function joinFromLink(): Promise<void> {
  const join = parseJoin(location.hash);
  // the token must not stay in the address bar, the history or a bookmark
  history.replaceState(null, '', location.pathname + location.search);
  if (!join) return;
  try {
    const r = await joinWorkspace(join.token, join.server, (existing) =>
      confirm(`Use the shared workspace on this device?\n\nIt has ${existing}. Taking it replaces the tasks and notes in this browser now.`),
    );
    if (r === 'kept') return void notify('Connected, nothing replaced yet', { body: 'run "sync pull" to use the shared copy, or "sync push" to keep this one', durationMs: 15_000 });
    if (r === 'same') return;
    if (separateAppStorage()) {
      return void notify('Synced in Safari', {
        body: 'an app on the home screen keeps its own data: add it (Share > Add to Home Screen), open it, and run "sync join" with the link copied on the other device',
        durationMs: 30_000,
      });
    }
    notify('Syncing with the shared workspace', { body: 'changes on this device now save there too', tone: 'success' });
  } catch (err) {
    failed(err);
  }
}

/** Stop syncing. The file stays in the folder. */
export async function disconnect() {
  handle = null;
  try {
    await idb('readwrite', (s) => s.delete('folder'));
  } catch {
    /* ignore */
  }
  syncState.set({ ...EMPTY });
  setStatus('sync', null);
}

export function setAuto(on: boolean) {
  patch({ auto: on });
  if (on) schedulePush();
}

/** Ask for permission again (from a click) and catch up. */
export async function reconnect(): Promise<void> {
  if (kindOf(get(syncState)) === 'cloud') {
    setStatus('sync', null);
    lastCheck = 0;
    await checkCloud();
    schedulePush();
    return;
  }
  await folder(true);
  setStatus('sync', null);
  lastCheck = 0;
  await checkFile();
  schedulePush();
}

/* ----------------------------------------------------------- auto sync */

let pushTimer: ReturnType<typeof setTimeout> | undefined;
const PUSH_DELAY = 3000;

function failed(err: unknown) {
  if (err instanceof SyncError && /needs your OK/.test(err.message)) return askAgain();
  notify('Sync failed', { body: `${(err as Error).message}. If it keeps happening, run "issue" to report it.`, tone: 'error', durationMs: 10_000 });
}

/** The browser forgot the permission (a new visit): one click in the status bar brings it back. */
function askAgain() {
  setStatus('sync', {
    text: '⟳ sync folder',
    tone: 'accent',
    order: 5,
    title: `Click to let this site use the folder "${get(syncState).folder}" again`,
    onClick: () => void reconnect().catch(failed),
  });
}

function schedulePush() {
  if (restoring) return;
  const s = get(syncState);
  if (!connected(s) || !s.auto || !s.dirty) return;
  // Never overwrite a file this browser has not synced with yet: `sync pull` or `sync push` decides.
  if (!s.fileAt) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = undefined;
    push(false, true).catch(failed);
  }, PUSH_DELAY);
}

/** The other copy is newer than this browser's last sync, and this browser has changes too. */
function newerNotice() {
  notify('Sync: the other copy has newer data, and so does this browser', {
    body: 'run "sync pull" to use that copy, or "sync push" to keep this one',
    durationMs: 15_000,
  });
}

let lastCheck = 0;

/** Load a newer file from the folder, when this browser has nothing unsaved. */
async function checkFile() {
  const s = get(syncState);
  if (kindOf(s) === 'cloud') return checkCloud();
  if (!s.folder || !s.auto) return;
  if (Date.now() - lastCheck < 5000) return;
  lastCheck = Date.now();
  let h: DirHandle;
  try {
    h = await folder(false);
  } catch (err) {
    return failed(err);
  }
  let found: Awaited<ReturnType<typeof readFile>>;
  try {
    found = await readFile(h);
  } catch (err) {
    return failed(err);
  }
  if (!found || found.at === s.fileAt) return;
  if (dataKey(found.backup) === dataKey(snapshot())) return patch({ fileAt: found.at });
  if (get(syncState).dirty) return newerNotice();
  await pull(false).catch(failed);
}

let started = false;

/** Track changes and keep in step with the folder. Safe to call more than once. */
export function startSync() {
  if (started || typeof window === 'undefined') return;
  started = true;
  try {
    const synced = sessionStorage.getItem('s2301:synced');
    if (synced) {
      sessionStorage.removeItem('s2301:synced');
      notify('Loaded from sync', { body: synced, tone: 'success' });
    }
  } catch {
    /* ignore */
  }
  onStorageChange((key) => {
    if (restoring || QUIET.test(key)) return;
    if (!get(syncState).dirty) patch({ dirty: true });
    schedulePush();
  });
  if (/[#&]sync=/.test(location.hash)) void joinFromLink();
  else void checkFile();
  schedulePush();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkFile();
  });
  window.addEventListener('focus', () => void checkFile());
  // Write what is waiting before the page goes away (best effort).
  window.addEventListener('pagehide', () => {
    if (pushTimer) {
      clearTimeout(pushTimer);
      void push(false, true).catch(() => {});
    }
  });
}
