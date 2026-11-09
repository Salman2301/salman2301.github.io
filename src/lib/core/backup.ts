import { freezeStorage, load, removeRaw, storedKeys, writeRaw } from './storage';
import { ymd } from './dates';
import { HIGH_SCORES_KEY, mergeBest } from '../games/scores';

/**
 * Backups: everything the site keeps in this browser (tasks, notes, spaces,
 * themes, layout, scores, history, ...) as one JSON file. Restoring replaces
 * all of it and reloads the page.
 *
 * Sync settings (sync:*) never go into a backup: they belong to this browser.
 */

export const BACKUP_FORMAT = 'salman2301-workspace';

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: 1;
  /** ISO time the backup was made. */
  exportedAt: string;
  /** Stored values by key (without the s2301: prefix). */
  data: Record<string, unknown>;
}

/** Keys that stay out of backups and survive a restore. */
const KEEP_LOCAL = /^sync:/;

/** Everything stored, as a backup. */
export function snapshot(): Backup {
  const data: Record<string, unknown> = {};
  for (const key of storedKeys().sort()) {
    if (KEEP_LOCAL.test(key)) continue;
    const value = load<unknown>(key, undefined);
    if (value !== undefined) data[key] = value;
  }
  return { format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(), data };
}

/** Read a backup from JSON text. Null when it is not one of ours. */
export function parseBackup(text: string): Backup | null {
  try {
    const b = JSON.parse(text) as Partial<Backup>;
    if (b?.format !== BACKUP_FORMAT || b.version !== 1 || !b.data || typeof b.data !== 'object' || Array.isArray(b.data)) return null;
    return b as Backup;
  } catch {
    return null;
  }
}

const count = (v: unknown) => (Array.isArray(v) ? v.length : 0);

/** "12 tasks, 4 notes, 3 spaces" */
export function summarize(b: Backup): string {
  const parts = [
    [count(b.data['tasks:list']), 'task'],
    [count(b.data['notes:list']), 'note'],
    [count(b.data['tasks:projects']), 'space'],
  ] as const;
  return parts.map(([n, word]) => `${n} ${word}${n === 1 ? '' : 's'}`).join(', ');
}

/**
 * Replace everything stored with the backup. Open stores are stopped from
 * writing first, so call location.reload() right after.
 */
export function restore(b: Backup) {
  // High scores never go down: keep the better of this browser's and the backup's.
  const best = mergeBest(load<Record<string, number>>(HIGH_SCORES_KEY, {}), b.data[HIGH_SCORES_KEY] as Record<string, number> | undefined);
  freezeStorage();
  for (const key of storedKeys()) if (!KEEP_LOCAL.test(key)) removeRaw(key);
  for (const [key, value] of Object.entries(b.data)) {
    if (KEEP_LOCAL.test(key)) continue;
    writeRaw(key, JSON.stringify(value));
  }
  if (Object.keys(best).length) writeRaw(HIGH_SCORES_KEY, JSON.stringify(best));
}

/** Save a backup file. Returns its file name. */
export function downloadBackup(): string {
  const name = `salman2301-backup-${ymd(new Date())}.json`;
  const blob = new Blob([JSON.stringify(snapshot(), null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return name;
}

/** Ask for a backup file. Resolves to its text, or null when cancelled. */
export function pickFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      resolve(file ? await file.text() : null);
    });
    // current browsers fire "cancel" when the dialog is closed without a file
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
