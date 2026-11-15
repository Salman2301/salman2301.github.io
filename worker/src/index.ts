/**
 * s2301-sync: the workspace document behind the site, so a phone and a laptop
 * share one copy without either owning it.
 *
 *   GET  /health                 liveness, no token
 *   GET  /v1/workspace           { rev, updatedAt, device, doc }   (404 when empty)
 *   PUT  /v1/workspace           { baseRev, doc, device } -> { rev, updatedAt }
 *                                409 with the current copy when baseRev is stale
 *   GET  /v1/revisions?limit=20  revision list, newest first
 *   GET  /v1/revisions/:rev      one older revision, to recover from a bad write
 *
 * Every call but /health needs `Authorization: Bearer <token>`. Two kinds work:
 *
 *   - SYNC_TOKEN, the secret set with wrangler: the workspace "default"
 *   - a token a browser made itself, "s2301_" plus 43 base64url characters
 *     (32 random bytes): its own workspace, kept under the token's SHA-256,
 *     made on its first write. "sync share" in the site hands it to a phone.
 *     MAX_WORKSPACES caps how many of these the server holds.
 */

import { countWorkspaces, KEEP, listRevisions, read, readRevision, write } from './store';

/** A token made by the site: 32 random bytes, base64url. */
const MADE_TOKEN = /^s2301_[A-Za-z0-9_-]{43}$/;
const MAX_WORKSPACES_DEFAULT = 20;
/** Bodies larger than this are refused before they are read. */
const MAX_BODY = 8 * 1024 * 1024;
/** The document itself, measured after a normal parse. */
const MAX_DOC = 6 * 1024 * 1024;
const MAX_DEVICE = 64;
const REVISIONS_DEFAULT = 20;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const headers = cors(request.headers.get('Origin'), env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    try {
      if (url.pathname === '/health') return json({ ok: true, time: Date.now() }, 200, headers);

      const ID = await workspaceFor(request, env);
      if (!ID) return json({ error: 'unauthorized' }, 401, headers);

      if (url.pathname === '/' || url.pathname === '') {
        return json({ name: 's2301-sync', ok: true, endpoints: ['/v1/workspace', '/v1/revisions'] }, 200, headers);
      }

      if (url.pathname === '/v1/workspace') {
        if (request.method === 'GET') return await getWorkspace(env, ID, headers);
        if (request.method === 'PUT') return await putWorkspace(request, env, ID, headers);
        return methodNotAllowed('GET, PUT, OPTIONS', headers);
      }

      if (url.pathname === '/v1/revisions') {
        if (request.method !== 'GET') return methodNotAllowed('GET, OPTIONS', headers);
        const limit = clamp(Number(url.searchParams.get('limit') ?? REVISIONS_DEFAULT), 1, KEEP);
        return json({ revisions: await listRevisions(env.DB, ID, limit) }, 200, headers);
      }

      const one = /^\/v1\/revisions\/(\d{1,9})$/.exec(url.pathname);
      if (one) {
        if (request.method !== 'GET') return methodNotAllowed('GET, OPTIONS', headers);
        const row = await readRevision(env.DB, ID, Number(one[1]));
        if (!row) return json({ error: 'no such revision' }, 404, headers);
        return json({ rev: row.rev, device: row.device, at: row.at, doc: parse(row.doc) }, 200, headers);
      }

      return json({ error: 'not found' }, 404, headers);
    } catch (err) {
      // Structured, one line per failure: `wrangler tail` reads these.
      console.error(JSON.stringify({ at: new Date().toISOString(), path: url.pathname, method: request.method, error: message(err) }));
      return json({ error: 'internal error' }, 500, headers);
    }
  },
} satisfies ExportedHandler<Env>;

/* ---------------------------------------------------------------- routes */

async function getWorkspace(env: Env, ID: string, headers: Headers): Promise<Response> {
  const row = await read(env.DB, ID);
  if (!row) return json({ error: 'empty', rev: 0 }, 404, headers);
  const doc = parse(row.doc);
  if (!doc) return json({ error: 'stored document is not JSON' }, 500, headers);
  return json({ rev: row.rev, updatedAt: row.updated_at, device: row.device, doc }, 200, headers);
}

async function putWorkspace(request: Request, env: Env, ID: string, headers: Headers): Promise<Response> {
  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (declared > MAX_BODY) return tooLarge(headers);

  const text = await request.text();
  if (text.length > MAX_BODY) return tooLarge(headers);

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: 'body is not JSON' }, 400, headers);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'body must be an object' }, 400, headers);

  const { baseRev, doc, device } = body as { baseRev?: unknown; doc?: unknown; device?: unknown };
  if (!Number.isInteger(baseRev) || (baseRev as number) < 0) return json({ error: 'baseRev must be 0 or the last revision you saw' }, 400, headers);
  if (!isWorkspace(doc)) return json({ error: 'doc must be a workspace backup (format salman2301-workspace, version 1)' }, 400, headers);

  const stored = JSON.stringify(doc);
  if (stored.length > MAX_DOC) return tooLarge(headers);

  // A made token's first write makes a new workspace: only while there is room.
  if (baseRev === 0 && ID.startsWith('k_') && !(await read(env.DB, ID))) {
    const max = Number(env.MAX_WORKSPACES ?? MAX_WORKSPACES_DEFAULT);
    if ((await countWorkspaces(env.DB, 'k_')) >= max) return json({ error: 'this server holds as many workspaces as it is allowed to' }, 403, headers);
  }

  const at = Date.now();
  const name = cleanDevice(device);
  const res = await write(env.DB, ID, baseRev as number, stored, name, at);
  if (res.ok) return json({ rev: res.rev, updatedAt: res.updatedAt }, 200, headers);

  // Somebody wrote first: hand back their copy so the client can choose.
  const row = await read(env.DB, ID);
  return json(
    {
      conflict: true,
      rev: row?.rev ?? 0,
      updatedAt: row?.updated_at ?? 0,
      device: row?.device ?? '',
      doc: row ? parse(row.doc) : null,
    },
    409,
    headers,
  );
}

/* --------------------------------------------------------------- helpers */

function isWorkspace(doc: unknown): boolean {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return false;
  const d = doc as { format?: unknown; version?: unknown; data?: unknown };
  return d.format === 'salman2301-workspace' && d.version === 1 && !!d.data && typeof d.data === 'object' && !Array.isArray(d.data);
}

function cleanDevice(device: unknown): string {
  if (typeof device !== 'string') return '';
  // Control characters and separators out, one tidy label in.
  return device
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, MAX_DEVICE);
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return max;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/**
 * The workspace a request's token opens, or null. SYNC_TOKEN (checked in
 * constant time) opens "default"; a made token opens "k_" + its SHA-256, so
 * the token itself is never stored.
 */
async function workspaceFor(request: Request, env: Env): Promise<string | null> {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const enc = new TextEncoder();
  const secret = env.SYNC_TOKEN ?? '';
  if (secret) {
    const a = enc.encode(token);
    const b = enc.encode(secret);
    if (a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b)) return 'default';
  }
  if (!MADE_TOKEN.test(token)) return null;
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(token)));
  return 'k_' + Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('');
}

function cors(origin: string | null, env: Env): Headers {
  const headers = new Headers({ 'Cache-Control': 'no-store', Vary: 'Origin' });
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    headers.set('Access-Control-Max-Age', '86400');
  }
  return headers;
}

function json(body: unknown, status: number, headers: Headers): Response {
  const out = new Headers(headers);
  out.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers: out });
}

function tooLarge(headers: Headers): Response {
  return json({ error: 'too large', limit: MAX_BODY }, 413, headers);
}

function methodNotAllowed(allow: string, headers: Headers): Response {
  const out = new Headers(headers);
  out.set('Allow', allow);
  return json({ error: 'method not allowed' }, 405, out);
}
