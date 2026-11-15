// Cloud sync in a real browser: the site against a local sync Worker.
//
//   cd worker && npx wrangler dev --port 8899 --local --var SYNC_TOKEN:test-token
//
// then, after `vite build` and `vite preview --port 4317`:
//   cat mcp/test/browser-header.mjs mcp/test/browser-cloud.mjs > /tmp/x.mjs && node /tmp/x.mjs <outdir>
//
// CLOUD and TOKEN override the address and token.
const CLOUD = process.env.CLOUD ?? 'http://127.0.0.1:8899';
const TOKEN = process.env.TOKEN ?? 'test-token';
const api = (path, init = {}) =>
  fetch(CLOUD + path, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
const remote = async () => {
  const res = await api('/v1/workspace');
  return res.status === 404 ? null : await res.json();
};

const task = (id, no, text) => ({ id, no, text, done: false, pomodoros: 0, projectId: 'inbox', createdAt: Date.now() });
const backup = (data) => ({ format: 'salman2301-workspace', version: 1, exportedAt: '2026-11-15T00:00:00.000Z', data });

// Another device got here first: the server already holds its copy.
let res = await api('/v1/workspace', {
  method: 'PUT',
  body: JSON.stringify({ baseRev: 0, doc: backup({ 'tasks:list': [task('s1', 1, 'Only on the server')], 'tasks:seq': 1 }), device: 'iPhone · Safari' }),
});
check('the server starts with another device\'s copy', res.status === 200 && (await res.json()).rev === 1);

await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('s2301:tasks:list', ${JSON.stringify(
    JSON.stringify([task('c1', 1, 'Seeded here'), task('c2', 2, 'Also here')]),
  )}); localStorage.setItem('s2301:tasks:seq', '2'); }`,
});
await send('Page.navigate', { url: 'http://localhost:4317/' });
await sleep(3000);

const runCmd = async (line) => {
  await ev(
    `(() => { const i = document.querySelector('.input-line input'); i.focus(); i.value = ${JSON.stringify(line)}; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); })()`,
  );
  await sleep(900);
};
const bodyText = () => ev('document.body.innerText');
const state = () => ev(`localStorage.getItem('s2301:sync:folder') ?? ''`);
const localTasks = () => ev(`JSON.parse(localStorage.getItem('s2301:tasks:list') || '[]').map((t) => t.text)`);

// 1. Connecting to a server that has data must not overwrite it.
await runCmd(`sync cloud ${CLOUD} ${TOKEN}`);
await sleep(1200);
let doc = await remote();
check('connecting writes nothing over the server\'s copy', doc?.rev === 1 && doc.doc.data['tasks:list'].length === 1, JSON.stringify(doc).slice(0, 200));
check('the user is offered a choice instead', /already has a copy with 1 task/.test(await bodyText()), (await bodyText()).slice(-300));
check('this browser keeps its own tasks meanwhile', (await localTasks()).join() === 'Seeded here,Also here', (await localTasks()).join());
check('nothing is marked as synced yet', /"fileAt":\s*0/.test(await state()), await state());

// 2. sync pull takes the server's copy, and stops being an unsaved change.
await runCmd('sync pull');
await sleep(4000);
check('the pull replaces this browser with the server copy', (await localTasks()).join() === 'Only on the server', (await localTasks()).join());
const pulled = await remote();
check('the sync state follows the pull', new RegExp(`"rev":\\s*${pulled.rev}`).test(await state()) && /"dirty":\s*false/.test(await state()), await state());
let base = pulled.rev;

// 3. A local change reaches the server on its own.
await runCmd('todo add A task from this browser');
await sleep(4500);
doc = await remote();
check('auto-sync writes the change on top of the pull', doc?.rev > base && doc.doc.data['tasks:list'].some((t) => t.text === 'A task from this browser'), `base ${base} now ${doc?.rev} ${JSON.stringify(doc?.doc?.data?.['tasks:list']?.map((t) => t.text))}`);
base = doc.rev;

// 4. Another device writes in between.
const theirs = doc.doc;
theirs.data['tasks:list'].push(task('p1', 9, 'From the phone'));
res = await api('/v1/workspace', { method: 'PUT', body: JSON.stringify({ baseRev: doc.rev, doc: theirs, device: 'iPhone · Safari' }) });
const phone = await res.json();
check('the other device writes a newer revision', res.status === 200 && phone.rev === base + 1, JSON.stringify(phone));

// 5. This browser changes too: the save must not overwrite the phone's work.
await runCmd('todo add Local only');
await sleep(4500);
doc = await remote();
check('auto-sync leaves the newer revision alone', doc?.rev === phone.rev && !doc.doc.data['tasks:list'].some((t) => t.text === 'Local only'), `${doc?.rev}/${phone.rev} ${JSON.stringify(doc?.doc?.data?.['tasks:list']?.map((t) => t.text))}`);
check('the user is told both sides have changes', /newer data/.test(await bodyText()));
check('this browser is still marked as having unsaved changes', /"dirty":\s*true/.test(await state()));

// 6. sync pull replaces this browser with the server's copy and reloads.
await runCmd('sync pull');
await sleep(4000);
check("the pull brought the phone's task in", (await localTasks()).includes('From the phone'), (await localTasks()).join());
check('the pull dropped the local-only task', !(await localTasks()).includes('Local only'), (await localTasks()).join());

// 7. After a pull, this browser pushes again normally.
base = (await remote()).rev;
await runCmd('todo add After the pull');
await sleep(4500);
doc = await remote();
check('the next change lands on top of the pulled revision', doc?.rev > base && doc.doc.data['tasks:list'].some((t) => t.text === 'After the pull'), `${base} -> ${doc?.rev} ${JSON.stringify(doc?.doc?.data?.['tasks:list']?.map((t) => t.text))}`);

// 8. sync off forgets the server, and the token goes with it.
await runCmd('sync off');
await sleep(800);
check('sync off clears the server and the token', !/"url":\s*"[^"]/.test(await state()) && !/"token":\s*"[^"]/.test(await state()), await state());

console.log(logs.filter((l) => !/favicon|Failed to load resource/.test(l)).join('\n') || 'no console errors');
console.log(fail ? `FAILED ${fail}` : 'ALL PASSED');
done(fail ? 1 : 0);
