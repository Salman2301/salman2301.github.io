/**
 * End-to-end: the MCP server in --cloud mode against a local sync Worker.
 *
 *   node mcp/test/server-cloud.test.mjs mcp/server.mjs worker
 *
 * Starts `wrangler dev` with a throwaway D1 in a temp folder, so nothing
 * touches the deployed Worker.
 */

import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [server, workerDir] = process.argv.slice(2);
const PORT = 8860 + Math.floor(Math.random() * 30);
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = 'cloud-test-token';
const WRANGLER = join(workerDir, 'node_modules/.bin/wrangler');

let fail = 0;
const check = (name, ok, info = '') => {
  if (!ok) fail++;
  console.log(ok ? 'ok  ' : 'FAIL', name, ok ? '' : String(info).slice(0, 400));
};

const dir = mkdtempSync(join(tmpdir(), 's2301-cloud-'));
execFileSync(WRANGLER, ['d1', 'migrations', 'apply', 's2301', '--local', '--persist-to', dir], { cwd: workerDir, stdio: 'pipe' });
const dev = spawn(WRANGLER, ['dev', '--port', String(PORT), '--local', '--persist-to', dir, '--var', `SYNC_TOKEN:${TOKEN}`], {
  cwd: workerDir,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let devLog = '';
dev.stdout.on('data', (c) => (devLog += c));
dev.stderr.on('data', (c) => (devLog += c));

const cleanup = () => {
  dev.kill('SIGTERM');
  rmSync(dir, { recursive: true, force: true });
};

await up();

function client(args) {
  const p = spawn('node', [server, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '';
  let id = 0;
  let err = '';
  const wait = new Map();
  p.stderr.on('data', (c) => (err += c));
  p.stdout.on('data', (c) => {
    buf += c;
    let at;
    while ((at = buf.indexOf('\n')) >= 0) {
      const m = JSON.parse(buf.slice(0, at));
      buf = buf.slice(at + 1);
      wait.get(m.id)?.(m);
    }
  });
  const rpc = (method, params) =>
    new Promise((r) => {
      const i = ++id;
      wait.set(i, r);
      p.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: i, method, params })}\n`);
    });
  const call = async (name, a = {}) => {
    const m = await rpc('tools/call', { name, arguments: a });
    const t = m.result?.content?.[0]?.text;
    let v;
    try {
      v = JSON.parse(t);
    } catch {
      v = t;
    }
    return m.result?.isError ? { err: t } : { ok: v };
  };
  const close = () =>
    new Promise((r) => {
      p.on('exit', r);
      p.stdin.end();
    });
  return { rpc, call, close, err: () => err };
}

async function up() {
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
  console.log(devLog.slice(-1200));
  console.log('wrangler dev did not start');
  cleanup();
  process.exit(1);
}

const remote = (path = '/v1/workspace', init = {}) =>
  fetch(`${BASE}${path}`, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' } });

try {
  const c = client(['--cloud', BASE, '--token', TOKEN]);
  const init = await c.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  check('initialize over cloud mode', !!init.result?.capabilities?.tools && /get_overview/.test(init.result.instructions));

  const list = await c.rpc('tools/list');
  check('the data tools are offered', list.result.tools.length === 26);

  let r = await c.call('add_task', { text: 'Bought from the phone' });
  check('a tool call writes to the server', r.ok?.added?.text === 'Bought from the phone', JSON.stringify(r));

  let res = await remote();
  let body = await res.json();
  check('the server holds revision 1 with the task', res.ok && body.rev === 1 && body.doc.data['tasks:list'].length === 1 && body.device === 'mcp', JSON.stringify(body).slice(0, 240));

  r = await c.call('list_tasks');
  check('the next call reads what it wrote', r.ok?.tasks?.some((t) => t.text === 'Bought from the phone'), JSON.stringify(r).slice(0, 240));

  /* another device writes in between: the server retries instead of clobbering */
  const theirs = body.doc;
  theirs.data['tasks:list'].push({ id: 'phone-1', no: 2, text: 'From the phone', done: false, pomodoros: 0, projectId: 'inbox', createdAt: Date.now() });
  const put = await remote('/v1/workspace', { method: 'PUT', body: JSON.stringify({ baseRev: 1, doc: theirs, device: 'phone' }) });
  check('a second writer lands revision 2', put.ok && (await put.json()).rev === 2);

  r = await c.call('add_task', { text: 'Added after the phone wrote' });
  check('the MCP call survives the race and adds its task', r.ok?.added?.text === 'Added after the phone wrote', JSON.stringify(r).slice(0, 240));

  res = await remote();
  body = await res.json();
  const texts = body.doc.data['tasks:list'].map((t) => t.text);
  check('both writers are in the workspace', body.rev === 3 && texts.includes('From the phone') && texts.includes('Added after the phone wrote'), JSON.stringify(texts));

  /* nothing changed? nothing written */
  const before = body.rev;
  await c.call('list_tasks');
  body = await (await remote()).json();
  check('a read does not write a revision', body.rev === before, body.rev);

  /* a wrong token is a clean error, not a crash */
  const wrong = client(['--cloud', BASE, '--token', 'nope']);
  await wrong.rpc('initialize', { protocolVersion: '2025-06-18' });
  r = await wrong.call('get_overview');
  check('a wrong token comes back as a tool error', /token/i.test(r.err ?? ''), JSON.stringify(r));
  await wrong.close();

  /* read-only */
  const ro = client(['--cloud', BASE, '--token', TOKEN, '--read-only']);
  await ro.rpc('initialize', { protocolVersion: '2025-06-18' });
  const roTools = await ro.rpc('tools/list');
  check('--read-only offers only reads', !roTools.result.tools.some((t) => t.name === 'add_task') && roTools.result.tools.some((t) => t.name === 'get_overview'));
  await ro.close();

  await c.close();
  check('the server exits when stdin closes', true);
} finally {
  cleanup();
}

console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED');
process.exit(fail ? 1 : 0);
