import { get } from 'svelte/store';
import { parseBackup, restore, snapshot, summarize, type Backup } from './backup';
import { notify } from './notify';
import { setStatus } from './status';
import { onStorageChange, persisted } from './storage';

/**
 * Folder sync: everything this site keeps (the same data as a backup) is
 * written to one file, salman2301-workspace.json, in a folder you pick on
 * your computer. Put that folder in iCloud Drive, Dropbox, Google Drive,
 * OneDrive or Syncthing, and every computer that picks the same folder
 * shares your tasks, notes and settings. Nothing goes to a server of ours.
 *
 * - changes are written to the file a few seconds after you make them
 * - when the page opens or comes back into view, a newer file (written by
 *   another computer) is loaded, unless this browser has unsaved changes of
 *   its own: then you choose with `sync pull` or `sync push`
 *
 * Needs the File System Access API: Chrome, Edge, Brave, Opera on desktop.
 * Elsewhere `backup` and `backup import` move the same file by hand.
 */

export const SYNC_FILE = 'salman2301-workspace.json';
export const ISSUES_URL = 'https://github.com/Salman2301/salman2301.github.io/issues';

export interface SyncState {
  /** The folder's name, for display ('' when not set up). */
  folder: string;
  auto: boolean;
  /** lastModified of the file after our last write or read. */
  fileAt: number;
  /** Local changes not written yet. */
  dirty: boolean;
  /** Last successful write or read (ms). */
  lastSync: number;
}

const EMPTY: SyncState = { folder: '', auto: true, fileAt: 0, dirty: false, lastSync: 0 };
export const syncState = persisted<SyncState>('sync:folder', EMPTY, 0);
const patch = (p: Partial<SyncState>) => syncState.update((s) => ({ ...s, ...p }));

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
const dataKey = (b: Backup) => JSON.stringify(b.data);

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
  patch({ folder: h.name, fileAt: 0, dirty: true });
  const found = await readFile(h);
  if (found && dataKey(found.backup) !== dataKey(snapshot())) {
    // Wait for the user's choice: neither side is overwritten yet.
    return { folder: h.name, existing: summarize(found.backup) };
  }
  await push();
  return { folder: h.name };
}

/** Write this browser's data to the folder. */
export async function push(ask = true): Promise<void> {
  const h = await folder(ask);
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
  const h = await folder(ask);
  const found = await readFile(h);
  if (!found) throw new SyncError(`there is no ${SYNC_FILE} in the folder yet: run "sync push"`);
  const next: SyncState = { ...get(syncState), fileAt: found.at, dirty: false, lastSync: Date.now() };
  if (dataKey(found.backup) === dataKey(snapshot())) {
    syncState.set(next);
    return;
  }
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
  const s = get(syncState);
  if (!s.folder || !s.auto || !s.dirty) return;
  // Never overwrite a file this browser has not synced with yet: `sync pull` or `sync push` decides.
  if (!s.fileAt) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = undefined;
    push(false).catch(failed);
  }, PUSH_DELAY);
}

let lastCheck = 0;

/** Load a newer file from the folder, when this browser has nothing unsaved. */
async function checkFile() {
  const s = get(syncState);
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
  if (get(syncState).dirty) {
    notify('Sync: the folder has newer data, and so does this browser', {
      body: 'run "sync pull" to use the folder\'s copy, or "sync push" to keep this one',
      durationMs: 15_000,
    });
    return;
  }
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
      notify('Loaded from your sync folder', { body: synced, tone: 'success' });
    }
  } catch {
    /* ignore */
  }
  onStorageChange((key) => {
    if (QUIET.test(key)) return;
    if (!get(syncState).dirty) patch({ dirty: true });
    schedulePush();
  });
  void checkFile();
  schedulePush();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkFile();
  });
  window.addEventListener('focus', () => void checkFile());
  // Write what is waiting before the page goes away (best effort).
  window.addEventListener('pagehide', () => {
    if (pushTimer) {
      clearTimeout(pushTimer);
      void push(false).catch(() => {});
    }
  });
}
