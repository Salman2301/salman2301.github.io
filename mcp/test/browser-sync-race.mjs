// Lost-write race: the browser's auto-save must not overwrite a file that
// another writer changed after this browser last synced. Uses a private
// browser folder (OPFS) as the sync folder, since headless Chrome cannot
// drive the folder picker. Run after `vite build` with `vite preview` on 4317:
//   cat browser-header.mjs browser-sync-race.mjs > /tmp/x.mjs && node /tmp/x.mjs <outdir>
await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('ws', { create: true });` });
await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__tools = {}; Object.defineProperty(Document.prototype, 'modelContext', { configurable: true, get() { return { registerTool: async (t) => { window.__tools[t.name] = t; } }; } });` });
await send('Page.navigate', { url: 'http://localhost:4317/' });
await sleep(3000);

const runCmd = async (line) => { await ev(`(() => { const i = document.querySelector('.input-line input'); i.focus(); i.value = ${JSON.stringify(line)}; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); })()`); await sleep(800); };
const call = async (name, args = {}) => JSON.parse(await ev(`(async () => { try { return JSON.stringify({ ok: await window.__tools[${JSON.stringify(name)}].execute(${JSON.stringify(args)}, {}) }); } catch (e) { return JSON.stringify({ err: e.message }); } })()`));
const FILE = `(async () => (await (await (await navigator.storage.getDirectory()).getDirectoryHandle('ws')).getFileHandle('salman2301-workspace.json')))()`;
const readWs = () => ev(`${FILE}.then(async (fh) => (await fh.getFile()).text())`);
const writeWs = (text) => ev(`${FILE}.then(async (fh) => { const w = await fh.createWritable(); await w.write(${JSON.stringify(text)}); await w.close(); return 'ok'; })`);

await runCmd('sync folder');
await sleep(1500);
const first = (await readWs()) ?? '';
check('sync folder creates the workspace file', first.includes('"format"'), first.slice(0, 80));

// 1. A local change saves on its own: the baseline the test edits.
await call('add_task', { text: 'Other' });
await sleep(4500);
const t1 = (await readWs()) ?? '';
check('a local change is saved to the folder', t1.includes('"Other"'));

// 2. "Another computer" writes the file: the same task, edited.
const doc = JSON.parse(t1);
const task = (doc.data['tasks:list'] ?? []).find((t) => t.text === 'Other');
check('found the task to edit in the file', !!task);
if (task) task.text = 'Edited elsewhere';
await writeWs(JSON.stringify(doc, null, 1));

// 3. This browser makes its own change; the auto-save must not overwrite the folder.
await call('add_task', { text: 'Local only' });
await sleep(4500);
const t2 = (await readWs()) ?? '';
check('auto-save leaves the newer folder file alone', t2.includes('Edited elsewhere') && !t2.includes('Local only'), t2.slice(0, 120));
check('the user is told both sides have changes', (await ev(`document.body.innerText`)).includes('newer data'));
check('this browser still has unsaved changes', /"dirty":\s*true/.test((await ev(`localStorage.getItem('s2301:sync:folder') ?? ''`)) ?? ''));

// 4. The explicit command keeps this browser's copy, as before.
await runCmd('sync push');
await sleep(1500);
const t3 = (await readWs()) ?? '';
check('sync push writes this browser\'s copy', t3.includes('Local only') && !t3.includes('Edited elsewhere'));

console.log(logs.filter((l) => !/favicon|Failed to load resource/.test(l)).join('\n') || 'no console errors');
console.log(fail ? `FAILED ${fail}` : 'ALL PASSED');
done(fail ? 1 : 0);
