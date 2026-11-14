// Tags in the task widget: #name in a task tags it, the chips filter, new
// tasks get the picked tag, and the # menu tags and untags. Run after
// `vite build` with `vite preview` on 4317:
//   cat browser-header.mjs browser-tags.mjs > /tmp/x.mjs && node /tmp/x.mjs <outdir>
await send('Page.navigate', { url: 'http://localhost:4317/' });
await sleep(3000);
const runCmd = async (line) => { await ev(`(() => { const i = document.querySelector('.input-line input'); i.focus(); i.value = ${JSON.stringify(line)}; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); })()`); await sleep(800); };
const addInTodo = async (text) => { await ev(`(() => { const i = document.querySelector('.todo form input'); i.value = ${JSON.stringify(text)}; i.dispatchEvent(new Event('input', { bubbles: true })); i.closest('form').requestSubmit(); })()`); await sleep(400); };
const rowTexts = () => ev(`[...document.querySelectorAll('.todo li.task .text')].map((x) => x.textContent.trim())`);
const stored = () => ev(`JSON.parse(localStorage.getItem('s2301:tasks:list') || '[]')`);

await runCmd('todo');
check('the task widget opens with a "+ tag" button', (await ev(`document.querySelector('.todo .tags .tag.add')?.textContent.trim()`)) === '+ tag');

await addInTodo('Call Base The Gym #outreach');
await addInTodo('Shoot the reel #content about #12');
await addInTodo('Untagged task');
let list = await stored();
check('#name tags a task and leaves the text clean', list.find((t) => t.text === 'Call Base The Gym')?.tags?.join() === 'outreach', JSON.stringify(list));
check('a task number is not a tag', list.find((t) => /reel/.test(t.text))?.text === 'Shoot the reel about #12' && list.find((t) => /reel/.test(t.text)).tags.join() === 'content', JSON.stringify(list));
const projects = await ev(`JSON.parse(localStorage.getItem('s2301:tasks:projects') || '[]')`);
check('the space keeps the new tags', projects[0]?.tags?.join() === 'outreach,content', JSON.stringify(projects));
check('the tag bar shows them', (await ev(`[...document.querySelectorAll('.todo .tags .tag')].map((b) => b.textContent.trim()).join('|')`)) === 'all|#outreach1|#content1|+');
check('tasks show their tags', (await ev(`document.querySelector('.todo li.task .ttag')?.textContent`)) === '#outreach');

await ev(`[...document.querySelectorAll('.todo .tags .tag')].find((b) => b.textContent.startsWith('#outreach')).click()`); await sleep(300);
check('picking a tag filters the list', JSON.stringify(await rowTexts()) === JSON.stringify(['Call Base The Gym']), JSON.stringify(await rowTexts()));
await addInTodo('Revisit if no call');
list = await stored();
check('a new task gets the picked tag', list.find((t) => t.text === 'Revisit if no call')?.tags?.join() === 'outreach' && (await rowTexts()).length === 2, JSON.stringify(list));
await shot('tags-filtered');

await ev(`[...document.querySelectorAll('.todo .tags .tag')][0].click()`); await sleep(300);
check('"all" shows every task again', (await rowTexts()).length === 4);

// the # menu on a row
await ev(`(() => { const s = document.querySelector('.todo select[data-tag]'); s.value = 'content'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(300);
list = await stored();
check('the # menu adds a tag', list[0].tags?.join() === 'outreach,content', JSON.stringify(list[0]));
await ev(`(() => { const s = document.querySelector('.todo select[data-tag]'); s.value = 'outreach'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(300);
list = await stored();
check('and takes one off', list[0].tags?.join() === 'content', JSON.stringify(list[0]));

// remove a tag from the space (asks first when tasks use it)
await ev(`window.confirm = () => true`);
await ev(`[...document.querySelectorAll('.todo .tags .tag')].find((b) => b.textContent.startsWith('#content')).click()`); await sleep(300);
await ev(`document.querySelector('.todo .tag-del').click()`); await sleep(300);
list = await stored();
check('removing a tag takes it off the space and its tasks', !list.some((t) => t.tags?.includes('content')) && (await ev(`JSON.parse(localStorage.getItem('s2301:tasks:projects'))[0].tags.join()`)) === 'outreach', JSON.stringify(list));
check('the tasks stay', list.length === 4);
await shot('tags-all');

console.log(logs.filter((l) => !/favicon|Failed to load resource/.test(l)).join('\n') || 'no console errors');
console.log(fail ? `FAILED ${fail}` : 'ALL PASSED');
done(fail ? 1 : 0);
