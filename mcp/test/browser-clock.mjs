// The clock shows what is due today: a list under the time, and dots on an
// analog dial. Run after `vite build` with `vite preview` on 4317:
//   cat browser-header.mjs browser-clock.mjs > /tmp/x.mjs && node /tmp/x.mjs <outdir>
const pad = (n) => String(n).padStart(2, '0');
const d = new Date(); const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const later = new Date(Date.now() + 2 * 3600e3); const earlier = new Date(Date.now() - 30 * 60e3);
const hm = (x) => `${pad(x.getHours())}:${pad(x.getMinutes())}`;
// keep both on today's date, near midnight too
const soon = later.getDate() === d.getDate() ? hm(later) : '23:59';
const before = earlier.getDate() === d.getDate() ? hm(earlier) : '00:00';
const seed = [
  { id: 'a', no: 1, text: 'Revisit Base The Gym', done: false, pomodoros: 0, projectId: 'inbox', createdAt: 1, due: `${day} ${soon}` },
  { id: 'b', no: 2, text: 'Morning call', done: false, pomodoros: 0, projectId: 'inbox', createdAt: 2, due: `${day} ${before}` },
  { id: 'c', no: 3, text: 'Post the reel', done: false, pomodoros: 0, projectId: 'inbox', createdAt: 3, due: day },
  { id: 'd', no: 4, text: 'Finished already', done: true, pomodoros: 0, projectId: 'inbox', createdAt: 4, due: day },
  { id: 'e', no: 5, text: 'Tomorrow thing', done: false, pomodoros: 0, projectId: 'inbox', createdAt: 5, due: '2099-01-01' },
];
await send('Page.addScriptToEvaluateOnNewDocument', { source: `if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('s2301:tasks:list', ${JSON.stringify(JSON.stringify(seed))}); localStorage.setItem('s2301:tasks:seq', '5'); }` });
await send('Page.navigate', { url: 'http://localhost:4317/' });
await sleep(3000);
const runCmd = async (line) => { await ev(`(() => { const i = document.querySelector('.input-line input'); i.focus(); i.value = ${JSON.stringify(line)}; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); })()`); await sleep(800); };
await runCmd('open clock');
await sleep(800);
const rows = await ev(`[...document.querySelectorAll('.clock-pane .agenda button')].map((b) => b.textContent.replace(/\\s+/g, ' ').trim())`);
check('the clock lists what is due today, done and other days left out', JSON.stringify(rows) === JSON.stringify([`today #3 Post the reel`, `${before} #2 Morning call`, `${soon} #1 Revisit Base The Gym`].sort((a, b) => (a.startsWith('today') ? -1 : b.startsWith('today') ? 1 : a.localeCompare(b)))) || (rows.length === 3 && rows.some((r) => r.includes('Revisit')) && !rows.some((r) => /Finished|Tomorrow/.test(r))), JSON.stringify(rows));
check('the next one is marked, a past one dimmed', (await ev(`document.querySelector('.clock-pane .agenda .next')?.textContent`))?.includes('Revisit') && (await ev(`document.querySelector('.clock-pane .agenda .past')?.textContent`))?.includes('Morning call'));
check('the footer counts them', (await ev(`[...document.querySelectorAll('.clock-pane .clock-bar button')].find((b) => b.textContent.startsWith('today'))?.textContent`)) === 'today 3');
await shot('clock-digital');
// an analog face: dots on the rim
await ev(`(() => { const p = document.querySelector('.clock-pane'); p.focus(); p.dispatchEvent(new KeyboardEvent('keydown', { code: 'BracketRight', bubbles: true })); })()`); await sleep(500);
check('an analog dial shows a dot per timed reminder', (await ev(`document.querySelectorAll('.clock-pane svg.dial .remind').length`)) === 2, await ev(`document.querySelectorAll('.clock-pane svg.dial .remind').length`));
await shot('clock-analog');
// clicking one opens the task
await ev(`[...document.querySelectorAll('.clock-pane .agenda button')].find((b) => b.textContent.includes('Revisit')).click()`); await sleep(800);
check('clicking it opens the task list at it', await ev(`!!document.querySelector('.todo [data-task="a"]')`));
// "today" cycles: on hover, then hidden, then shown again
const todayBtn = `[...document.querySelectorAll('.clock-pane .clock-bar button')].find((b) => b.textContent.startsWith('today'))`;
await ev(`${todayBtn}.click()`); await sleep(300);
check('"today" once: shown only on hover', (await ev(`${todayBtn}.textContent`)) === 'today 3 · hover' && (await ev(`document.querySelector('.clock-pane').classList.contains('today-hover')`)));
// the pointer is away (and focus elsewhere): hidden; over the clock: shown
await ev(`document.activeElement?.blur()`); await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 795 }); await sleep(400);
check('away from the clock the list is hidden', (await ev(`getComputedStyle(document.querySelector('.clock-pane .agenda')).opacity`)) === '0');
const box = await ev(`(() => { const r = document.querySelector('.clock-pane').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y }); await sleep(400);
check('hovering the clock shows it', (await ev(`getComputedStyle(document.querySelector('.clock-pane .agenda')).opacity`)) === '1');
await shot('clock-hover');
await ev(`${todayBtn}.click()`); await sleep(300);
check('"today" twice: hidden', (await ev(`document.querySelectorAll('.clock-pane .agenda, .clock-pane .remind').length`)) === 0 && (await ev(`${todayBtn}.textContent`)) === 'today off');
await ev(`${todayBtn}.click()`); await sleep(300);
check('and once more: shown again', (await ev(`document.querySelectorAll('.clock-pane .agenda').length`)) === 1);
console.log(logs.filter((l) => !/favicon|Failed to load resource/.test(l)).join('\n') || 'no console errors');
console.log(fail ? `FAILED ${fail}` : 'ALL PASSED');
done(fail ? 1 : 0);
