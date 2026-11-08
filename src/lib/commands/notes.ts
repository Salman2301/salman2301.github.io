import { get } from 'svelte/store';
import type { CommandDef } from '../core/types';
import { openWidget } from '../core/workspace';
import { createNote, deleteNote, findNote, notes, sortNotes, timeAgo, titleOf } from '../widgets/notes/store';

const SUBS = ['new', 'ls', 'open', 'cat', 'rm', 'search'];

const command: CommandDef = {
  name: 'notes',
  aliases: ['note'],
  description: 'markdown notes: open, list, create, print',
  usage: 'notes [new <title>|ls|open <n|title>|cat <n|title>|rm <n>|search <text>]',
  group: 'widgets',
  complete: (args) => (args.length <= 1 ? SUBS : sortNotes(get(notes)).map((_, i) => String(i + 1))),
  run: (ctx) => {
    const [sub, ...rest] = ctx.args;
    const arg = rest.join(' ').trim();
    const open = (id?: string) => openWidget('notes', id ? { noteId: id } : undefined, { from: ctx.paneId });

    if (!sub) return void open();

    if (sub === 'new') {
      const n = createNote(arg ? `# ${arg}\n\n` : '# ');
      ctx.print(`created "${titleOf(n)}"`, 'success');
      return void open(n.id);
    }
    if (sub === 'ls' || sub === 'list') {
      const list = sortNotes(get(notes));
      if (!list.length) return ctx.print('no notes yet. Try: notes new my first note', 'muted');
      return ctx.print(
        list.map((n, i) => `${String(i + 1).padStart(3)}  ${n.pinned ? '*' : ' '} ${titleOf(n).padEnd(36)} ${timeAgo(n.updatedAt)}`).join('\n'),
      );
    }
    if (sub === 'search') {
      if (!arg) return ctx.print('usage: notes search <text>', 'error');
      const q = arg.toLowerCase();
      const list = sortNotes(get(notes));
      const hits = list.filter((n) => n.body.toLowerCase().includes(q));
      if (!hits.length) return ctx.print(`no notes contain "${arg}"`, 'muted');
      return ctx.print(hits.map((n) => `${String(list.indexOf(n) + 1).padStart(3)}  ${titleOf(n)}`).join('\n'));
    }
    if (sub === 'open' || sub === 'cat' || sub === 'rm' || sub === 'delete') {
      if (!arg) return ctx.print(`usage: notes ${sub} <n|title>`, 'error');
      const note = findNote(arg);
      if (!note) return ctx.print(`no note matches "${arg}". Try: notes ls`, 'error');
      if (sub === 'open') return void open(note.id);
      if (sub === 'cat') return ctx.print(note.body || '(empty)');
      deleteNote(note.id);
      return ctx.print(`deleted "${titleOf(note)}"`, 'muted');
    }
    // "notes <title>" opens a matching note
    const note = findNote(ctx.args.join(' '));
    if (note) return void open(note.id);
    ctx.print(`unknown option "${sub}". usage: ${command.usage}`, 'error');
  },
};

export default command;
