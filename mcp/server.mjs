#!/usr/bin/env node
/**
 * Local MCP server for the workspace: lets an AI agent (Claude Code, T3 Code,
 * Claude Desktop, anything that speaks MCP) read and change your tasks, notes,
 * spaces and reminders.
 *
 * It works on the sync folder's file, salman2301-workspace.json: the same
 * file the site writes with "sync folder". Each tool call reads the file,
 * runs the site's own task and note code on it, and writes it back if
 * something changed. The open page loads the new file when you come back to it.
 *
 *   node mcp/server.mjs --file ~/Documents/workspace          over stdio (the harness starts it)
 *   node mcp/server.mjs --file ~/Documents/workspace --http   on http://127.0.0.1:8787/mcp
 *
 * No dependencies beyond the repo's own (esbuild, which comes with vite).
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SYNC_FILE = 'salman2301-workspace.json';
const FORMAT = 'salman2301-workspace';
const NAME = 'salman2301-workspace';
const VERSION = '0.1.0';
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

/* ------------------------------------------------------------------ options */

function options(argv) {
  const out = { file: process.env.WORKSPACE_FILE || '', http: false, port: 8787, readOnly: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file' || a === '--dir' || a === '-f') out.file = argv[++i] ?? '';
    else if (a === '--http') out.http = true;
    else if (a === '--port') {
      out.http = true;
      out.port = Number(argv[++i]);
    } else if (a === '--read-only') out.readOnly = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (!a.startsWith('-') && !out.file) out.file = a;
    else die(`unknown option: ${a}\n\n${USAGE}`);
  }
  return out;
}

const USAGE = `Local MCP server for your workspace (tasks, notes, spaces, reminders).

  node mcp/server.mjs --file <sync folder or file> [--http] [--port 8787] [--read-only]

  --file <path>   the folder you picked with "sync folder" on the site, or the
                  ${SYNC_FILE} inside it. Also read from WORKSPACE_FILE.
  --http          serve on http://127.0.0.1:<port>/mcp instead of stdio
  --port <n>      port for --http (default 8787)
  --read-only     offer only the tools that read

Add it to Claude Code:
  claude mcp add s2301 -- node ${join(HERE, 'server.mjs')} --file <sync folder>`;

function die(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

/** The workspace file for a path that may be the folder or the file itself. */
function workspacePath(input) {
  let p = input.startsWith('~') ? join(homedir(), input.slice(1)) : input;
  p = resolve(p);
  if (existsSync(p) && statSync(p).isDirectory()) return join(p, SYNC_FILE);
  return p.endsWith('.json') ? p : join(p, SYNC_FILE);
}

/* ------------------------------------------------- the site's tools, for Node */

/**
 * Bundle the site's tool code with esbuild, swapping the browser storage for
 * the in-memory one in storage.ts. Rebuilt on every start, so the server
 * always matches the checked-out site code.
 */
async function loadTools() {
  let esbuild;
  try {
    esbuild = await import('esbuild');
  } catch {
    die('esbuild is not installed. Run "yarn install" (or "npm install") in the repo first.');
  }
  const swap = {
    name: 'node-stand-ins',
    setup(build) {
      const storage = join(HERE, 'storage.ts');
      const stubs = join(HERE, 'stubs.ts');
      build.onResolve({ filter: /(^|\/)storage$/ }, (a) => (a.importer.includes(`${join('src', 'lib')}`) ? { path: storage } : null));
      build.onResolve({ filter: /(^|\/)(notify|workspace|ui)$/ }, (a) => (a.importer.includes(`${join('src', 'lib')}`) ? { path: stubs } : null));
    },
  };
  const outfile = join(HERE, '.build', 'tools.mjs');
  await esbuild.build({
    entryPoints: [join(HERE, 'tools.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node18',
    plugins: [swap],
    logLevel: 'silent',
  });
  return import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
}

/* ------------------------------------------------------------ the file */

function readWorkspace(path) {
  if (!existsSync(path)) {
    throw new Error(
      `there is no workspace file at ${path}. On the site, run "sync folder" and pick a folder, then start this server with --file <that folder>. A backup made with the "backup" command works too.`,
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`${path} is not valid JSON (${e.message}). It may be half-written: try again in a moment.`);
  }
  if (!parsed || parsed.format !== FORMAT || typeof parsed.data !== 'object' || parsed.data === null) {
    throw new Error(`${path} is not a workspace file (format "${FORMAT}" expected)`);
  }
  return parsed;
}

/** Write through a temporary file, so the site never reads half a file. */
function writeWorkspace(path, backup) {
  const tmp = `${path}.${process.pid}.tmp`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(tmp, JSON.stringify(backup, null, 1));
  renameSync(tmp, path);
}

/* ---------------------------------------------------------------- MCP */

const INSTRUCTIONS = `This server holds the user's personal workspace from salman2301.github.io: tasks (numbered #1, #2, ..., with due dates, repeat rules, notes and sub-tasks), markdown notes, and spaces (named groups of both).

Start with get_overview. Tasks are addressed by number, notes by id or title, spaces by name. Dates are YYYY-MM-DD or YYYY-MM-DD HH:MM in the user's local time, or a word such as today, tomorrow, monday.

Changes are written to the user's sync file straight away, and the open site loads them when the user returns to its tab. Delete only what the user asked to delete; undo_delete puts the last deleted thing back while this server keeps running.`;

async function main() {
  const opt = options(process.argv.slice(2));
  if (opt.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  if (!opt.file) die(`no workspace file given.\n\n${USAGE}`);
  const path = workspacePath(opt.file);
  const site = await loadTools();
  const tools = site.DATA_TOOLS.filter((t) => !opt.readOnly || t.annotations?.readOnlyHint);
  const byName = new Map(tools.map((t) => [t.name, t]));
  const log = (text) => process.stderr.write(`[${NAME}] ${text}\n`);

  // one call at a time: each is read file -> run -> write file
  let queue = Promise.resolve();
  const callTool = (name, args) => {
    const run = queue.then(async () => {
      const tool = byName.get(name);
      if (!tool) throw new Error(`unknown tool: ${name}`);
      const backup = readWorkspace(path);
      site.hydrate(backup.data);
      const result = await tool.execute(args && typeof args === 'object' ? args : {});
      if (site.changed()) {
        if (opt.readOnly) throw new Error('this server was started with --read-only');
        writeWorkspace(path, { ...backup, exportedAt: new Date().toISOString(), data: site.dump() });
        log(`${name} changed ${path}`);
      }
      return result;
    });
    queue = run.catch(() => undefined);
    return run;
  };

  const describe = (t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: {
      title: t.title,
      readOnlyHint: !!t.annotations?.readOnlyHint,
      destructiveHint: !!t.annotations?.consequentialHint,
      openWorldHint: false,
    },
  });

  /** Answer one JSON-RPC message. Returns null for notifications. */
  async function handle(msg) {
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      return msg && 'id' in msg && !('method' in msg) ? null : { jsonrpc: '2.0', id: msg?.id ?? null, error: { code: -32600, message: 'not a JSON-RPC 2.0 request' } };
    }
    const reply = (result) => ({ jsonrpc: '2.0', id: msg.id, result });
    const error = (code, message) => ({ jsonrpc: '2.0', id: msg.id, error: { code, message } });
    const isNote = !('id' in msg);
    switch (msg.method) {
      case 'initialize': {
        const asked = msg.params?.protocolVersion;
        return reply({
          protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: NAME, title: 'Workspace (tasks and notes)', version: VERSION },
          instructions: INSTRUCTIONS,
        });
      }
      case 'ping':
        return reply({});
      case 'tools/list':
        return reply({ tools: tools.map(describe) });
      case 'tools/call': {
        const name = msg.params?.name;
        if (!byName.has(name)) return error(-32602, `unknown tool: ${name}`);
        try {
          const out = await callTool(name, msg.params?.arguments);
          return reply({ content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out, null, 1) }], isError: false });
        } catch (e) {
          return reply({ content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }], isError: true });
        }
      }
      case 'resources/list':
        return reply({ resources: [] });
      case 'prompts/list':
        return reply({ prompts: [] });
      default:
        return isNote ? null : error(-32601, `method not found: ${msg.method}`);
    }
  }

  if (opt.http) return serveHttp(opt.port, handle, log, path, tools.length);
  serveStdio(handle);
  log(`${tools.length} tools on stdio, file ${path}${existsSync(path) ? '' : ' (not there yet)'}`);
}

/* -------------------------------------------------------------- transports */

/** stdio: one JSON message per line in, one per line out. Logs go to stderr. */
function serveStdio(handle) {
  let buffer = '';
  let open = 0;
  let ended = false;
  const send = (m) => process.stdout.write(`${JSON.stringify(m)}\n`);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    let at;
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at).trim();
      buffer = buffer.slice(at + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } });
        continue;
      }
      open++;
      Promise.all((Array.isArray(msg) ? msg : [msg]).map(handle))
        .then((answers) => {
          const real = answers.filter(Boolean);
          if (Array.isArray(msg)) {
            if (real.length) send(real);
          } else if (real[0]) send(real[0]);
        })
        .finally(() => {
          open--;
          if (ended && !open) process.exit(0);
        });
    }
  });
  process.stdin.on('end', () => {
    ended = true;
    if (!open) process.exit(0);
  });
}

/**
 * Streamable HTTP, the plain request/response part: POST a JSON-RPC message to
 * /mcp, get JSON back. Listens on this computer only, and turns away requests
 * that come from a web page, so a site you visit cannot reach your tasks.
 */
function serveHttp(port, handle, log, path, count) {
  const local = (host) => /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(host ?? '');
  const server = createServer((req, res) => {
    const end = (status, body, headers = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', ...headers });
      res.end(body === undefined ? '' : JSON.stringify(body));
    };
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (!local(req.headers.host)) return end(403, { error: 'this server only answers on localhost' });
    const origin = req.headers.origin;
    if (origin && !local(origin.replace(/^https?:\/\//, ''))) return end(403, { error: 'requests from web pages are not allowed' });
    if (url.pathname !== '/mcp') return end(404, { error: 'the MCP endpoint is /mcp' });
    if (req.method === 'GET' || req.method === 'DELETE') return end(405, { error: 'POST JSON-RPC messages to this address' }, { allow: 'POST' });
    if (req.method !== 'POST') return end(405, { error: 'method not allowed' }, { allow: 'POST' });
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => {
      body += c;
      if (body.length > 8 * 1024 * 1024) req.destroy();
    });
    req.on('end', async () => {
      let msg;
      try {
        msg = JSON.parse(body);
      } catch {
        return end(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } });
      }
      const answers = (await Promise.all((Array.isArray(msg) ? msg : [msg]).map(handle))).filter(Boolean);
      if (!answers.length) return end(202);
      end(200, Array.isArray(msg) ? answers : answers[0]);
    });
  });
  server.on('error', (e) => die(e.code === 'EADDRINUSE' ? `port ${port} is in use: pick another with --port` : e.message));
  server.listen(port, '127.0.0.1', () => {
    log(`${count} tools on http://127.0.0.1:${port}/mcp, file ${path}${existsSync(path) ? '' : ' (not there yet)'}`);
    log(`add it to Claude Code:  claude mcp add --transport http s2301 http://127.0.0.1:${port}/mcp`);
  });
}

main().catch((e) => die(e?.stack || String(e)));
