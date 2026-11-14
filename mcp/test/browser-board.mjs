// The Kanban widget (a column per tag), task notes as linked notes in the notes
// app, and the notes archive (clearing a task archives its note). Run after
// `vite build` with `vite preview` on 4317:
//   cat browser-header.mjs browser-board.mjs > /tmp/x.mjs && node /tmp/x.mjs <outdir>
await send('Page.navigate', { url: 'http://localhost:4317/' });
await sleep(3000);
const runCmd = async (line) => { await ev(`(() => { const i = document.querySelector('.input-line input'); i.focus(); i.value = ${JSON.stringify(line)}; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); })()`); await sleep(800); };
const addInTodo = async (text) => { await ev(`(() => { const i = document.querySelector('.todo form input'); i.value = ${JSON.stringify(text)}; i.dispatchEvent(new Event('input', { bubbles: true })); i.closest('form').requestSubmit(); })()`); await sleep(400); };
const stored = (k) => ev(`JSON.parse(localStorage.getItem('s2301:${k}') || '[]')`);
const col = (name) => `[...document.querySelectorAll('.kanban .col')].find((c) => c.getAttribute('aria-label') === ${JSON.stringify(name)})`;
const colCards = (name) => ev(`[...(${col(name)}?.querySelectorAll('.card .text') ?? [])].map((x) => x.textContent.replace(/\\s+/g, ' ').trim())`);

await runCmd('todo');
await addInTodo('Call Base The Gym #outreach');
await addInTodo('Post the reel #content');
await addInTodo('Plain task');

// the kanban widget, next to the task list
check('the task list has no board of its own', !(await ev(`!!document.querySelector('.todo .board, .todo .views')`)));
await ev(`(() => { const i = document.querySelector('.input-line input'); i.focus(); })()`);
await runCmd('open kanban --new'); await sleep(600);
check('the kanban widget opens', await ev(`!!document.querySelector('.kanban .board')`));
check('the board has a column per tag and one for no tag', (await ev(`[...document.querySelectorAll('.kanban .col .col-name')].map((x) => x.textContent).join('|')`)) === '#outreach|#content|no tag');
check('cards sit in their tag\'s column', JSON.stringify(await colCards('#outreach')) === JSON.stringify(['#1 Call Base The Gym']) && (await colCards('no tag')).length === 1, JSON.stringify(await colCards('#outreach')));
// drag a card from #outreach to #content (a real drag-and-drop sequence)
await ev(`(() => { const card = ${col('#outreach')}.querySelector('.card'); const to = ${col('#content')}; const dt = new DataTransfer(); card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt })); to.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })); to.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })); card.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt })); })()`); await sleep(400);
let list = await stored('tasks:list');
check('dragging a card swaps its tag', list[0].tags?.join() === 'content' && (await colCards('#content')).length === 2, JSON.stringify(list[0]));
// the column menu moves it back
await ev(`(() => { const s = ${col('#content')}.querySelector('.card select'); s.value = 'outreach'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(300);
list = await stored('tasks:list');
check('the card menu moves it too', list[0].tags?.join() === 'outreach', JSON.stringify(list[0]));
// add from a column
await ev(`${col('#outreach')}.querySelector('.col-add-btn').click()`); await sleep(200);
await ev(`(() => { const i = ${col('#outreach')}.querySelector('input.col-add'); i.value = 'Revisit if no call'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`); await sleep(300);
list = await stored('tasks:list');
check('adding in a column tags the new task', list.find((t) => t.text === 'Revisit if no call')?.tags?.join() === 'outreach', JSON.stringify(list));
await shot('board');

// a task's note opens in the notes app, linked to the task
await ev(`${col('#outreach')}.querySelector('.card .cact').click()`); await sleep(1200);
let notes = await stored('notes:list');
list = await stored('tasks:list');
const linked = notes.find((n) => n.id === list[0].noteId);
check('the note button makes a linked note in the task\'s space', !!linked && linked.body.startsWith('# Call Base The Gym\n\n[@task: #1]'), JSON.stringify(linked));
check('it opens in the notes app', (await ev(`document.querySelector('.notes .title')?.textContent`)) === 'Call Base The Gym');
await shot('task-note');

// clear the finished task: its note goes to the archive
await ev(`${col('#outreach')}.querySelector('.card input[type=checkbox]').click()`); await sleep(300);
await ev(`[...document.querySelectorAll('.todo footer button')].find((b) => b.textContent.trim() === 'clear done').click()`); await sleep(500);
notes = await stored('notes:list');
check('clearing the task archives its note', notes.find((n) => n.id === linked.id)?.archived > 0, JSON.stringify(notes.map((n) => [n.id, n.archived])));
// a narrow notes pane hides its list: open it
if (!(await ev(`!!document.querySelector('.notes .side')`))) { await ev(`document.querySelector('.notes .bar .icon-btn').click()`); await sleep(300); }
check('the archived note leaves the note list', !(await ev(`[...document.querySelectorAll('.notes .list .item .t')].map((x) => x.textContent)`)).includes('Call Base The Gym'));
await ev(`[...document.querySelectorAll('.notes .side-foot button')].find((b) => b.textContent.startsWith('archived')).click()`); await sleep(400);
check('the archived list shows it', (await ev(`[...document.querySelectorAll('.notes .list .item .t')].map((x) => x.textContent)`)).includes('Call Base The Gym'));
await ev(`[...document.querySelectorAll('.notes .list .item')].find((b) => b.textContent.includes('Call Base The Gym')).click()`); await sleep(300);
await shot('archived');
await ev(`[...document.querySelectorAll('.notes .bar button')].find((b) => b.textContent === 'restore').click()`); await sleep(300);
notes = await stored('notes:list');
check('restore brings it back', !notes.find((n) => n.id === linked.id)?.archived);

// old inline task notes move into notes of their own
await ev(`(() => { const l = JSON.parse(localStorage.getItem('s2301:tasks:list')); l[0].notes = 'old inline text'; delete l[0].noteId; localStorage.setItem('s2301:tasks:list', JSON.stringify(l)); })()`);
await send('Page.reload'); await sleep(6000);
list = await stored('tasks:list'); notes = await stored('notes:list');
const moved = notes.find((n) => n.id === list[0].noteId);
check('old inline notes become a linked note on load', !list[0].notes && moved?.body.endsWith('old inline text'), JSON.stringify(list[0]));

console.log(logs.filter((l) => !/favicon|Failed to load resource/.test(l)).join('\n') || 'no console errors');
console.log(fail ? `FAILED ${fail}` : 'ALL PASSED');
done(fail ? 1 : 0);
