# s2301-sync

The server behind `sync cloud`: one workspace document per user, in D1, so a
phone and a laptop share the same tasks, notes and spaces without either
owning the file.

Live at **https://s2301-sync.lucky-unit-af42.workers.dev**
(`worker/` in [salman2301.github.io](https://salman2301.github.io)).

## What it stores

One row in `workspace`: the JSON document the site already writes for
`backup` and `sync folder` (`salman2301-workspace.json`, format
`salman2301-workspace` v1). Nothing is rewritten: the server keeps the exact
document, so the site, the folder and a backup file stay interchangeable.

Every write is a **revision**. The last 30 are kept in `revisions`, so a bad
write can be read back.

## The API

All calls except `/health` need `Authorization: Bearer <token>`. Two kinds of token work:

- `SYNC_TOKEN`, the secret below: the workspace `default`.
- A token a browser made itself (`sync cloud` with no token): `s2301_` plus 43 base64url characters, 32 random bytes. Each one opens a workspace of its own, made on its first write and stored under the token's SHA-256, so the token itself is never stored. `MAX_WORKSPACES` (20 in `wrangler.jsonc`) caps how many of these the server holds; past it, a new one's first write gets `403`, and existing ones keep working.

| Method | Path | What it does |
| --- | --- | --- |
| `GET` | `/health` | `{ ok: true }`, no token |
| `GET` | `/v1/workspace` | `{ rev, updatedAt, device, doc }`; `404` when nothing is stored yet |
| `PUT` | `/v1/workspace` | `{ baseRev, doc, device }` → `{ rev, updatedAt }`; `409` with the current copy when `baseRev` is stale |
| `GET` | `/v1/revisions?limit=20` | revision list, newest first |
| `GET` | `/v1/revisions/:rev` | one older revision |

A write is compare-and-set: two devices cannot both land on the same
`baseRev`. The loser gets `409` **with the winner's document**, so the client
can show both copies and let the user pick — the same choice `sync folder`
already gives with `sync pull` / `sync push`. Nothing is merged.

Devices send a label (`Mac · Chrome`, `iPhone · Safari`, `mcp`) that shows up
in the revision list.

## Setup from scratch

```bash
cd worker
npm install
npx wrangler login                      # already done on this machine
npx wrangler d1 create s2301            # copy database_id into wrangler.jsonc
npx wrangler d1 migrations apply s2301 --remote
openssl rand -base64 32 > ~/.s2301-cloud-token
npx wrangler secret put SYNC_TOKEN < ~/.s2301-cloud-token
npx wrangler deploy
```

`ALLOWED_ORIGINS` in `wrangler.jsonc` lists the pages allowed to call it from
a browser: the live site, `vite dev` on 5173, and the port the browser tests
preview on (4317). Add another origin there if you run the site elsewhere.

## Development

```bash
cd worker
npm run db:local                        # apply migrations to the local D1
SYNC_TOKEN=dev npm run dev              # http://127.0.0.1:8787
npm test                                # API tests against wrangler dev
npm run check                           # wrangler types + tsc
```

`.dev.vars` holds the local token (gitignored). `npm test` starts its own
`wrangler dev` on a random port with a throwaway D1 in a temp folder, so it
never touches the deployed database.

## Connecting a device

In the site's terminal:

```text
sync cloud            makes a token if this browser has none, and syncs
sync share            a QR code: scan it with a phone to join
```

`sync share` encodes a link to the site with the token (and the server, when
it is not the default) in the `#` fragment. Opening it joins that workspace;
the site removes the fragment from the address bar right away.
`sync cloud <address> <token>` connects with a token you already have.

The first device to connect writes its own copy as revision 1. Every later
device is offered the server's copy: `sync pull` to use it, `sync push` to
replace it with that device's data.

The token is kept in `localStorage` under a `sync:` key, which backups and
`backup import` skip, so it never ends up inside a workspace file or a folder
someone else syncs.

## The MCP server

The same data, for an agent, without a local folder:

```bash
node mcp/server.mjs --cloud https://s2301-sync.lucky-unit-af42.workers.dev --token <token>
```

Each tool call reads the current revision, runs the site's own code on it,
and writes on top of that revision. If another device wrote in the meantime,
the call is retried on the fresh copy (up to three times) instead of
overwriting it.

## Cost and limits

Workers free tier plus D1 free tier is plenty for one user: a few writes per
day, a document measured in kilobytes. The Worker refuses bodies over 8 MiB
and documents over 6 MiB before storing anything.

## Notes

- Anyone with the token can read and change the workspace. Keep it to your
  own devices; `sync off` removes it from a device.
- Revision history is pruned to the last 30 writes, so this is not a backup
  system: `backup` in the site is.
- The site is on GitHub Pages; this Worker is deployed separately. A push to
  `master` does not deploy the Worker, and `wrangler deploy` does not touch
  the site.
