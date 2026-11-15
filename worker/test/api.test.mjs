/**
 * API tests for s2301-sync, against `wrangler dev` with a throwaway local D1.
 *
 *   npm test          (from worker/)
 *
 * Every run starts from an empty database in a temp folder, so it never touches
 * the deployed one.
 */

import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 8799 + Math.floor(Math.random() * 50);
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = 'test-token';
const WRANGLER = 'node_modules/.bin/wrangler';

let fail = 0;
const check = (name, ok, info = '') => {
  if (!ok) fail++;
  console.log(ok ? 'ok  ' : 'FAIL', name, ok ? '' : String(info).slice(0, 400));
};

const dir = mkdtempSync(join(tmpdir(), 's2301-sync-'));

execFileSync(WRANGLER, ['d1', 'migrations', 'apply', 's2301', '--local', '--persist-to', dir], { stdio: 'pipe' });

const dev = spawn(WRANGLER, ['dev', '--port', String(PORT), '--local', '--persist-to', dir, '--var', `SYNC_TOKEN:${TOKEN}`, '--var', 'MAX_WORKSPACES:2'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
dev.stdout.on('data', (c) => (log += c));
dev.stderr.on('data', (c) => (log += c));

const stop = () => {
  dev.kill('SIGTERM');
  rmSync(dir, { recursive: true, force: true });
};

await ready();
try {
  await run();
} finally {
  stop();
}
console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');
process.exit(fail ? 1 : 0);

/* ---------------------------------------------------------------- helpers */

async function ready() {
  const until = Date.now() + 45_000;
  while (Date.now() < until) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(log.slice(-1500));
  console.log('wrangler dev did not start');
  process.exit(1);
}

function text(doc, extra = {}) {
  return JSON.stringify({ baseRev: 0, doc, device: 'test', ...extra });
}
function workspace(tasks = 1) {
  return {
    format: 'salman2301-workspace',
    version: 1,
    exportedAt: '2026-11-15T00:00:00.000Z',
    data: { 'tasks:list': Array.from({ length: tasks }, (_, i) => ({ id: `t${i}`, no: i + 1, text: `task ${i}` })) },
  };
}
function call(path, init = {}) {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

async function run() {
  /* health and auth */
  const health = await fetch(`${BASE}/health`);
  check('health needs no token', health.ok && (await health.json()).ok === true);

  let res = await fetch(`${BASE}/v1/workspace`);
  check('no token is 401', res.status === 401, res.status);

  res = await call('/v1/workspace', { headers: { Authorization: 'Bearer wrong' } });
  check('a wrong token is 401', res.status === 401, res.status);

  res = await call('/');
  check('the front page names the service', res.ok && (await res.json()).name === 's2301-sync');

  /* empty, then first write */
  res = await call('/v1/workspace');
  check('an empty workspace is 404', res.status === 404, res.status);

  res = await call('/v1/workspace', { method: 'PUT', body: text(workspace(2)) });
  let body = await res.json();
  check('the first write is revision 1', res.status === 200 && body.rev === 1 && typeof body.updatedAt === 'number', JSON.stringify(body));

  res = await call('/v1/workspace');
  body = await res.json();
  check('it reads back with the document', res.status === 200 && body.rev === 1 && body.doc.data['tasks:list'].length === 2 && body.device === 'test', JSON.stringify(body).slice(0, 200));

  /* compare-and-set */
  res = await call('/v1/workspace', { method: 'PUT', body: text(workspace(3), { baseRev: 0, device: 'phone' }) });
  body = await res.json();
  check('writing over revision 1 from baseRev 0 is a conflict', res.status === 409 && body.conflict === true && body.rev === 1, JSON.stringify(body).slice(0, 200));
  check('the conflict hands back the current document', body.doc.data['tasks:list'].length === 2 && body.device === 'test');

  res = await call('/v1/workspace', { method: 'PUT', body: text(workspace(3), { baseRev: 1 }) });
  body = await res.json();
  check('a write from the revision we saw lands as 2', res.status === 200 && body.rev === 2, JSON.stringify(body));

  res = await call('/v1/workspace', { method: 'PUT', body: text(workspace(9), { baseRev: 1 }) });
  check('the same baseRev again is a conflict, not an overwrite', res.status === 409 && (await res.json()).rev === 2);

  /* one winner when several devices race */
  const race = await Promise.all(
    Array.from({ length: 6 }, (_, i) => call('/v1/workspace', { method: 'PUT', body: text(workspace(i + 4), { baseRev: 2, device: `d${i}` }) })),
  );
  const codes = race.map((r) => r.status);
  check('six writers on one revision: exactly one wins', codes.filter((c) => c === 200).length === 1 && codes.filter((c) => c === 409).length === 5, codes.join());

  res = await call('/v1/workspace');
  body = await res.json();
  const winning = (await Promise.all(race.map((r) => (r.status === 200 ? r.json() : null)))).find(Boolean);
  check('the winner is the stored revision', body.rev === 3 && winning.rev === 3 && body.doc.data['tasks:list'].length === body.doc.data['tasks:list'].length, `${body.rev}/${winning.rev}`);

  /* revisions */
  res = await call('/v1/revisions');
  body = await res.json();
  check('revisions are listed newest first', res.ok && body.revisions[0].rev === 3 && body.revisions.length === 3 && body.revisions.every((r) => r.bytes > 0), JSON.stringify(body).slice(0, 200));

  res = await call('/v1/revisions/1');
  body = await res.json();
  check('an old revision can be read back', res.ok && body.rev === 1 && body.doc.data['tasks:list'].length === 2);

  res = await call('/v1/revisions/999');
  check('a revision that does not exist is 404', res.status === 404);

  res = await call('/v1/revisions/abc');
  check('a revision that is not a number is 404', res.status === 404);

  res = await call('/v1/revisions?limit=2');
  check('limit is respected', (await res.json()).revisions.length === 2);

  res = await call('/v1/revisions?limit=1000');
  check('limit is clamped, not refused', res.ok && (await res.json()).revisions.length <= 30);

  /* validation */
  res = await call('/v1/workspace', { method: 'PUT', body: text({ format: 'something-else', version: 1, data: {} }) });
  check('a document that is not a workspace is refused', res.status === 400, res.status);

  res = await call('/v1/workspace', { method: 'PUT', body: text(workspace(), { baseRev: -1 }) });
  check('a negative baseRev is refused', res.status === 400);

  res = await call('/v1/workspace', { method: 'PUT', body: 'not json' });
  check('a body that is not JSON is refused', res.status === 400);

  res = await call('/v1/workspace', { method: 'PUT', body: text(workspace(), { baseRev: 3 }) });
  body = await res.json();
  check('a write with the current baseRev lands as 4', res.ok && body.rev === 4, JSON.stringify(body));

  res = await call('/v1/workspace', { method: 'PUT', body: text(workspace(), { baseRev: 4, device: 'name\u0000with\r\ncontrol characters' }) });
  const afterDevice = await (await call('/v1/workspace')).json();
  check('device labels are cleaned', res.ok && afterDevice.device === 'name with control characters', JSON.stringify(afterDevice).slice(0, 200));

  res = await call('/v1/workspace', { method: 'DELETE' });
  check('an unsupported method is 405 and says what is allowed', res.status === 405 && res.headers.get('allow') === 'GET, PUT, OPTIONS');

  res = await call('/v1/nope');
  check('an unknown path is 404', res.status === 404);

  /* CORS */
  res = await call('/v1/workspace', { method: 'OPTIONS', headers: { Origin: 'https://salman2301.github.io', 'Access-Control-Request-Method': 'PUT' } });
  check('a preflight from the site is allowed', res.status === 204 && res.headers.get('access-control-allow-origin') === 'https://salman2301.github.io');
  check('the preflight allows the token and a PUT', /authorization/i.test(res.headers.get('access-control-allow-headers') ?? '') && /PUT/.test(res.headers.get('access-control-allow-methods') ?? ''));

  res = await call('/v1/workspace', { headers: { Origin: 'https://evil.example' } });
  check('other origins get no CORS grant', res.headers.get('access-control-allow-origin') === null);

  res = await call('/v1/workspace', { headers: { Origin: 'http://localhost:5173' } });
  check('vite dev on localhost is allowed', res.headers.get('access-control-allow-origin') === 'http://localhost:5173');

  /* size */
  const huge = workspace();
  huge.data['notes:list'] = [{ id: 'n', body: 'x'.repeat(7 * 1024 * 1024) }];
  res = await call('/v1/workspace', { method: 'PUT', body: text(huge, { baseRev: 5 }) });
  check('an oversized document is refused before it is stored', res.status === 413, res.status);

  res = await call('/v1/workspace');
  check('the oversized write changed nothing', (await res.json()).rev === 5);

  /* tokens a browser made itself: each opens a workspace of its own */
  const as = (t) => (path, init = {}) => call(path, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${t}` } });
  const a = as('s2301_' + 'A'.repeat(43));
  const b = as('s2301_' + 'b-_9'.repeat(10) + 'xyz');
  res = await a('/v1/workspace');
  check('a made token starts with an empty workspace', res.status === 404, res.status);
  res = await a('/v1/workspace', { method: 'PUT', body: text(workspace(3)) });
  check('its first write makes the workspace', res.status === 200 && (await res.json()).rev === 1, res.status);
  res = await a('/v1/workspace');
  check('and it reads back', (await res.json()).doc?.data?.['tasks:list']?.length === 3);
  res = await b('/v1/workspace');
  check('another made token sees a different, empty workspace', res.status === 404, res.status);
  res = await call('/v1/workspace');
  check('the SYNC_TOKEN workspace is untouched', (await res.json()).rev === 5);
  res = await as('s2301_tooshort')('/v1/workspace');
  check('a token in the wrong shape is 401', res.status === 401, res.status);
  res = await as('S2301_' + 'A'.repeat(43))('/v1/workspace');
  check('the prefix is exact', res.status === 401, res.status);
  res = await b('/v1/workspace', { method: 'PUT', body: text(workspace()) });
  check('a second made workspace fits under MAX_WORKSPACES=2', res.status === 200, res.status);
  res = await as('s2301_' + 'C'.repeat(43))('/v1/workspace', { method: 'PUT', body: text(workspace()) });
  check('a third is refused: the server is full', res.status === 403, res.status);
  res = await a('/v1/workspace', { method: 'PUT', body: text(workspace(4), { baseRev: 1 }) });
  check('existing made workspaces still take writes when full', res.status === 200 && (await res.json()).rev === 2, res.status);
}
