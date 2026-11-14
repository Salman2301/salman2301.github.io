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

await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('s2301:tasks:list', ${JSON.stringify(
    JSON.stringify([
      { id: 'c1', no: 1, text: 'Seeded here', done: false, pomodoros: 0, projectId: 'inbox', createdAt: Date.now() },
      { id: 'c2', no: 2, text: 'Also here', done: false, pomodoros: 0, projectId: 'inbox', createdAt: Date.now() },
    ]),
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

// 1. Point this browser at the server: the seeded workspace goes up as revision 1.
check('the server starts empty', (await remote()) === null);
await runCmd(`sync cloud ${CLOUD} ${TOKEN}`);
await sleep(1500);
let doc = await remote();
check('sync cloud writes the first revision', doc?.rev === 1 && doc.doc.data['tasks:list'].length === 2, JSON.stringify(doc).slice(0, 200));
check('the device is named in the revision', /Mac|iPhone|Android|Linux|Windows/.test(doc?.device ?? ''), doc?.device);
check('sync shows the server, not a folder', /syncing with .*127\.0\.0\.1:8899/.test(await bodyText()), (await bodyText()).slice(0, 300));

// 2. A local change reaches the server on its own.
await runCmd('todo add A task from this browser');
await sleep(4500);
doc = await remote();
check('auto-sync writes the change', doc?.rev === 2 && doc.doc.data['tasks:list'].some((t) => t.text === 'A task from this browser'), JSON.stringify(doc?.doc?.data?.['tasks:list']?.map((t) => t.text)));

// 3. Another device writes in between.
const theirs = doc.doc;
theirs.data['tasks:list'].push({ id: 'p1', no: 9, text: 'From the phone', done: false, pomodoros: 0, projectId: 'inbox', createdAt: Date.now() });
let res = await api('/v1/workspace', { method: 'PUT', body: JSON.stringify({ baseRev: doc.rev, doc: theirs, device: 'iPhone · Safari' }) });
check('the other device lands revision 3', res.status === 200 && (await res.json()).rev === 3);

// 4. This browser changes too: the save must not overwrite the phone's work.
await runCmd('todo add Local only');
await sleep(4500);
doc = await remote();
check('auto-sync leaves the newer revision alone', doc?.rev === 3 && !doc.doc.data['tasks:list'].some((t) => t.text === 'Local only'), JSON.stringify(doc?.doc?.data?.['tasks:list']?.map((t) => t.text)));
check('the user is told both sides have changes', /newer data/.test(await bodyText()));
check('this browser is still marked as having unsaved changes', /"dirty":\s*true/.test(await state()));

// 5. sync pull replaces this browser with the server's copy and reloads.
await runCmd('sync pull');
await sleep(3500);
check('the pull brought the phone\'s task in', (await localTasks()).includes('From the phone'), (await localTasks()).join());
check('the pull dropped the local-only task', !(await localTasks()).includes('Local only'), (await localTasks()).join());
check('the sync state follows the pull', /"rev":\s*3/.test(await state()), await state());

// 6. After a pull, this browser pushes again normally.
await runCmd('todo add After the pull');
await sleep(4500);
doc = await remote();
check('the next change lands as revision 4', doc?.rev === 4 && doc.doc.data['tasks:list'].some((t) => t.text === 'After the pull'), `${doc?.rev} ${JSON.stringify(doc?.doc?.data?.['tasks:list']?.map((t) => t.text))}`);

// 7. sync off forgets the server, and the token goes with it.
await runCmd('sync off');
await sleep(800);
check('sync off clears the server and the token', !/"url":\s*"[^"]/.test(await state()) && !/"token":\s*"[^"]/.test(await state()), await state());

console.log(logs.filter((l) => !/favicon|Failed to load resource/.test(l)).join('\n') || 'no console errors');
console.log(fail ? `FAILED ${fail}` : 'ALL PASSED');
done(fail ? 1 : 0);
