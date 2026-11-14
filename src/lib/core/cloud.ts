import { parseBackup, type Backup } from './backup';

/**
 * Cloud sync: the same workspace file, kept on a Worker in this repo
 * (`worker/`) with D1 behind it. Where folder sync needs a desktop Chromium,
 * this works from a phone too, and both devices read one copy.
 *
 * The server is compare-and-set: a write says which revision it was based on
 * and is refused if another device wrote in between. Nothing is merged; the
 * user picks a side, exactly like the folder.
 */

/** The Worker deployed from `worker/`. Change it in `sync cloud <url>`. */
export const CLOUD_URL = 'https://s2301-sync.lucky-unit-af42.workers.dev';

export class CloudError extends Error {}

export interface Remote {
  rev: number;
  updatedAt: number;
  device: string;
  doc: Backup;
}

/** `host`, `http://host` and `https://host/` all become one base URL. */
export function baseUrl(input: string): string {
  const raw = input.trim().replace(/\/+$/, '');
  if (!raw) throw new CloudError('no address: run "sync cloud <address> <token>"');
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new CloudError(`"${input}" is not an address`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new CloudError('only http and https addresses work');
  return url.origin + url.pathname.replace(/\/+$/, '');
}

async function call(url: string, token: string, path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(baseUrl(url) + path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers as Record<string, string> | undefined) },
  });
  if (res.status === 401) throw new CloudError('the server did not accept the token: run "sync cloud <address> <token>"');
  return res;
}

/** Whether the address answers and the token works. Used when connecting. */
export async function check(url: string, token: string): Promise<void> {
  let res: Response;
  try {
    res = await call(url, token, '/v1/workspace');
  } catch (err) {
    if (err instanceof CloudError) throw err;
    throw new CloudError(`could not reach ${baseUrl(url)}: check the address and your connection`);
  }
  if (res.status === 404) return; // nothing written yet, which is fine
  if (!res.ok) throw new CloudError(`the server answered ${res.status}`);
}

/** What is on the server, or null when nothing has been written there yet. */
export async function read(url: string, token: string): Promise<Remote | null> {
  const res = await call(url, token, '/v1/workspace');
  if (res.status === 404) return null;
  const body = (await res.json()) as { rev?: unknown; updatedAt?: unknown; device?: unknown; doc?: unknown };
  const doc = parseBackup(JSON.stringify(body.doc ?? null));
  if (!doc || typeof body.rev !== 'number' || typeof body.updatedAt !== 'number') throw new CloudError('what the server sent is not a workspace');
  return { rev: body.rev, updatedAt: body.updatedAt, device: typeof body.device === 'string' ? body.device : '', doc };
}

export type WriteResult = { rev: number; updatedAt: number } | { conflict: Remote };

/**
 * Write, but only on top of `baseRev`. A refused write comes back as the
 * server's current copy, so the caller can ask the user which one wins.
 * `force` reads the current revision first and writes on top of it.
 */
export async function write(url: string, token: string, baseRev: number, doc: Backup, device: string, force = false): Promise<WriteResult> {
  let rev = baseRev;
  if (force) {
    const current = await read(url, token);
    rev = current?.rev ?? 0;
  }
  const res = await call(url, token, '/v1/workspace', { method: 'PUT', body: JSON.stringify({ baseRev: rev, doc, device }) });
  if (res.status === 409) {
    const body = (await res.json()) as { rev?: unknown; updatedAt?: unknown; device?: unknown; doc?: unknown };
    const theirs = parseBackup(JSON.stringify(body.doc ?? null));
    if (!theirs) throw new CloudError('the server refused the write and sent no usable copy');
    return { conflict: { rev: Number(body.rev ?? 0), updatedAt: Number(body.updatedAt ?? 0), device: typeof body.device === 'string' ? body.device : '', doc: theirs } };
  }
  if (!res.ok) throw new CloudError(`the server answered ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const body = (await res.json()) as { rev?: unknown; updatedAt?: unknown };
  if (typeof body.rev !== 'number' || typeof body.updatedAt !== 'number') throw new CloudError('the server did not confirm the write');
  return { rev: body.rev, updatedAt: body.updatedAt };
}
