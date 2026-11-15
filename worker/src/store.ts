/**
 * D1 access for the workspace document. Every write is one revision, and the
 * last KEEP revisions are kept so a bad write can be read back.
 */

/** Revisions kept per workspace. Older ones are deleted on write. */
export const KEEP = 30;

export interface WorkspaceRow {
  id: string;
  rev: number;
  doc: string;
  device: string;
  updated_at: number;
}

export interface RevisionRow {
  rev: number;
  doc: string;
  device: string;
  at: number;
}

export type WriteResult = { ok: true; rev: number; updatedAt: number } | { ok: false };

export async function read(db: D1Database, id: string): Promise<WorkspaceRow | null> {
  return await db
    .prepare('SELECT id, rev, doc, device, updated_at FROM workspace WHERE id = ?')
    .bind(id)
    .first<WorkspaceRow>();
}

/**
 * Append a revision, but only when nobody else wrote since `baseRev`.
 * `baseRev` 0 means "this is the first write"; a workspace that already exists
 * is then a conflict, not an overwrite.
 */
export async function write(db: D1Database, id: string, baseRev: number, doc: string, device: string, at: number): Promise<WriteResult> {
  if (baseRev === 0) {
    const res = await db
      .prepare('INSERT INTO workspace (id, rev, doc, device, updated_at) VALUES (?, 1, ?, ?, ?) ON CONFLICT(id) DO NOTHING')
      .bind(id, doc, device, at)
      .run();
    if (res.meta.changes !== 1) return { ok: false };
  } else {
    // The WHERE clause makes the compare-and-set atomic: two writers with the
    // same baseRev cannot both land.
    const res = await db
      .prepare('UPDATE workspace SET rev = rev + 1, doc = ?, device = ?, updated_at = ? WHERE id = ? AND rev = ?')
      .bind(doc, device, at, id, baseRev)
      .run();
    if (res.meta.changes !== 1) return { ok: false };
  }

  const rev = baseRev + 1;
  await db.batch([
    db
      .prepare('INSERT OR REPLACE INTO revisions (id, rev, doc, device, at) VALUES (?, ?, ?, ?, ?)')
      .bind(id, rev, doc, device, at),
    db.prepare('DELETE FROM revisions WHERE id = ? AND rev <= ?').bind(id, rev - KEEP),
  ]);
  return { ok: true, rev, updatedAt: at };
}

/** How many workspaces have ids starting with `prefix`. */
export async function countWorkspaces(db: D1Database, prefix: string): Promise<number> {
  const row = await db.prepare('SELECT count(*) AS n FROM workspace WHERE id LIKE ?').bind(prefix + '%').first<{ n: number }>();
  return row?.n ?? 0;
}

export interface RevisionMeta {
  rev: number;
  device: string;
  at: number;
  bytes: number;
}

export async function listRevisions(db: D1Database, id: string, limit: number): Promise<RevisionMeta[]> {
  const { results } = await db
    .prepare('SELECT rev, device, at, length(doc) AS bytes FROM revisions WHERE id = ? ORDER BY rev DESC LIMIT ?')
    .bind(id, limit)
    .all<RevisionMeta>();
  return results ?? [];
}

export async function readRevision(db: D1Database, id: string, rev: number): Promise<RevisionRow | null> {
  return await db
    .prepare('SELECT id, rev, doc, device, at FROM revisions WHERE id = ? AND rev = ?')
    .bind(id, rev)
    .first<RevisionRow>();
}
