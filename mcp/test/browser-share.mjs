// "sync cloud" without a token, "sync share" and joining from its QR code, in
// a real browser against a local sync Worker:
//
//   cd worker && npx wrangler dev --port 8899 --local --var SYNC_TOKEN:test-token
//
// then, after `vite build` and `vite preview --port 4317`:
//   cat mcp/test/browser-header.mjs mcp/test/browser-share.mjs > /tmp/x.mjs && node /tmp/x.mjs <outdir>
const CLOUD = process.env.CLOUD ?? 'http://127.0.0.1:8899';
const task = (id, no, text) => ({ id, no, text, done: false, pomodoros: 0, projectId: 'inbox', createdAt: Date.now() });
const runCmd = async (line) => {
  await ev(`(() => { const i = document.querySelector('.input-line input'); i.focus(); i.value = ${JSON.stringify(line)}; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); })()`);
  await sleep(1500);
};
const out = () => ev(`document.querySelector('.terminal')?.innerText ?? document.body.innerText`);
const state = async () => JSON.parse((await ev(`localStorage.getItem('s2301:sync:folder')`)) || '{}');
const tasksHere = async () => JSON.parse((await ev(`localStorage.getItem('s2301:tasks:list')`)) || '[]').map((t) => t.text);
/** A fresh device: nothing in storage. */
const wipe = () => ev(`(async () => { localStorage.clear(); sessionStorage.clear(); for (const d of (await indexedDB.databases?.()) ?? []) indexedDB.deleteDatabase(d.name); return 1; })()`);

// device 1, the laptop: its own tasks, no token yet
await send('Page.navigate', { url: 'http://localhost:4317/' });
await sleep(2500);
await ev(`localStorage.setItem('s2301:tasks:list', ${JSON.stringify(JSON.stringify([task('l1', 1, 'Laptop task'), task('l2', 2, 'Second laptop task')]))}); localStorage.setItem('s2301:tasks:seq', '2')`);
await send('Page.reload'); await sleep(2500);

await runCmd(`sync cloud ${CLOUD}`);
let s = await state();
check('"sync cloud" with no token makes one', /^s2301_[A-Za-z0-9_-]{43}$/.test(s.token ?? '') && s.kind === 'cloud', JSON.stringify(s).slice(0, 200));
check('and says it is a new workspace', /made a new token/.test(await out()));
const token = s.token;
let res = await fetch(`${CLOUD}/v1/workspace`, { headers: { Authorization: `Bearer ${token}` } });
let body = res.ok ? await res.json() : null;
check('the laptop\'s data is on the server under that token', body?.doc?.data?.['tasks:list']?.length === 2, res.status);
res = await fetch(`${CLOUD}/v1/workspace`, { headers: { Authorization: 'Bearer test-token' } });
check('the SYNC_TOKEN workspace is a different one', res.status === 404 || (await res.json()).doc?.data?.['tasks:list']?.[0]?.text !== 'Laptop task');

// sync off, then sync cloud again: the same token, not a new workspace
await runCmd('sync off');
await runCmd(`sync cloud ${CLOUD}`);
check('after "sync off", "sync cloud" reuses the token', (await state()).token === token);
check('and, the copies being the same, asks nothing', (await out()).match(/already has a copy/g) === null);

// share: a QR code that decodes to the join link
await runCmd('sync share');
check('"sync share" shows a QR code', await ev(`!!document.querySelector('.share svg.code path')`));
const decoded = await ev(`(async () => {
  const svg = document.querySelector('.share svg.code');
  const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
  await img.decode();
  const c = document.createElement('canvas'); c.width = c.height = 400; c.getContext('2d').drawImage(img, 0, 0, 400, 400);
  const found = await new BarcodeDetector({ formats: ['qr_code'] }).detect(c);
  return found[0]?.rawValue ?? '';
})()`);
check('the code scans to a join link with the token in the #fragment', decoded.startsWith('http://localhost:4317/#') && decoded.includes(`sync=${token}`) && decoded.includes('server='), decoded.slice(0, 60));
await shot('share');

// device 2, a fresh phone: open the link
await wipe();
await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
await send('Page.navigate', { url: decoded }); await sleep(5000);
check('the phone takes the shared copy', JSON.stringify(await tasksHere()) === JSON.stringify(['Laptop task', 'Second laptop task']), JSON.stringify(await tasksHere()));
s = await state();
check('and syncs with the same workspace', s.kind === 'cloud' && s.token === token);
check('the token is gone from the address bar', !(await ev(`location.href`)).includes('sync='));

// the phone adds a task: it reaches the server, where the laptop's token reads it
await ev(`(() => { const l = JSON.parse(localStorage.getItem('s2301:tasks:list')); })()`);
await runCmd('todo add Added on the phone');
await sleep(4500);
res = await fetch(`${CLOUD}/v1/workspace`, { headers: { Authorization: `Bearer ${token}` } });
body = await res.json();
check('a change on the phone lands in the shared workspace', body.doc.data['tasks:list'].some((t) => t.text === 'Added on the phone'), JSON.stringify(body.doc.data['tasks:list'].map((t) => t.text)));

// device 3, with tasks of its own: asked first, and "no" replaces nothing
await wipe();
await send('Page.navigate', { url: 'http://localhost:4317/' }); await sleep(2000);
await ev(`localStorage.setItem('s2301:tasks:list', ${JSON.stringify(JSON.stringify([task('o1', 1, 'Own task')]))}); localStorage.setItem('s2301:tasks:seq', '1')`);
await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.confirm = (m) => { window.__asked = m; return false; };` });
await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
await send('Page.navigate', { url: decoded }); await sleep(4000);
check('a device with its own tasks is asked first', /replaces the tasks and notes/.test((await ev(`window.__asked ?? ''`)) || ''));
check('saying no keeps its tasks', JSON.stringify(await tasksHere()) === JSON.stringify(['Own task']), JSON.stringify(await tasksHere()));

// device 4, an installed app on a fresh phone: "sync join <link>" pasted in
await wipe();
await send('Page.navigate', { url: 'http://localhost:4317/' }); await sleep(2500);
await runCmd('sync join not-a-link');
check('"sync join" with no link explains what to paste', /usage: sync join <link>/.test(await out()));
await runCmd(`sync join ${decoded}`);
check('"sync join <link>" takes the shared copy', (await tasksHere()).includes('Added on the phone'), JSON.stringify(await tasksHere()));
s = await state();
check('and syncs with the same workspace', s.kind === 'cloud' && s.token === token);
await runCmd(`sync join ${decoded}`);
check('joining again says it already is', /already syncing with that workspace/.test(await out()));

// device 5, its own tasks: "sync join" replaces nothing and says how to choose
await wipe();
await send('Page.navigate', { url: 'http://localhost:4317/' }); await sleep(2000);
await ev(`localStorage.setItem('s2301:tasks:list', ${JSON.stringify(JSON.stringify([task('o1', 1, 'Own task')]))}); localStorage.setItem('s2301:tasks:seq', '1')`);
await send('Page.reload'); await sleep(2500);
await runCmd(`sync join ${decoded}`);
check('"sync join" on a device with its own tasks keeps them', JSON.stringify(await tasksHere()) === JSON.stringify(['Own task']) && /nothing is replaced yet/.test(await out()), JSON.stringify(await tasksHere()));

console.log(logs.filter((l) => !/favicon|Failed to load resource|401|404/.test(l)).join('\n') || 'no console errors');
console.log(fail ? `FAILED ${fail}` : 'ALL PASSED');
done(fail ? 1 : 0);
