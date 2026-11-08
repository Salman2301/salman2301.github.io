import { get } from 'svelte/store';
import { persisted } from '../../core/storage';

export interface Note {
  id: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
}

const WELCOME = `# Welcome to notes

Notes are written in **markdown** and saved in this browser as you type.

## Cheat sheet

- **bold**, _italic_, \`inline code\`, [a link](https://salman2301.com)
- Lists like this one, and numbered lists:
  1. first
  2. second

- [x] task lists
- [ ] click the mode buttons above: edit, split, preview

> Quotes look like this.

\`\`\`js
const hello = (name) => \`hello \${name}\`;
\`\`\`

| shortcut | does |
| --- | --- |
| Tab | indent |
| Ctrl+B / Ctrl+I | bold / italic |

From any terminal: \`notes new <title>\`, \`notes ls\`, \`notes cat 1\`.
`;

function makeId() {
  return `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const now = Date.now();
export const notes = persisted<Note[]>('notes:list', [{ id: 'welcome', body: WELCOME, createdAt: now, updatedAt: now }], 300);

export function titleOf(note: Note | undefined): string {
  if (!note) return 'Untitled';
  const line = note.body.split('\n').find((l) => l.trim()) ?? '';
  const clean = line.replace(/^#+\s*/, '').replace(/[*_`>]/g, '').trim();
  return clean.slice(0, 60) || 'Untitled';
}

export function sortNotes(list: Note[]): Note[] {
  return [...list].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt);
}

export function createNote(body = ''): Note {
  const t = Date.now();
  const note: Note = { id: makeId(), body, createdAt: t, updatedAt: t };
  notes.update((list) => [note, ...list]);
  return note;
}

export function updateNote(id: string, body: string) {
  notes.update((list) => list.map((n) => (n.id === id && n.body !== body ? { ...n, body, updatedAt: Date.now() } : n)));
}

export function deleteNote(id: string) {
  notes.update((list) => list.filter((n) => n.id !== id));
}

export function togglePin(id: string) {
  notes.update((list) => list.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n)));
}

/** Find a note by 1-based position in the sorted list, or by title prefix. */
export function findNote(query: string): Note | undefined {
  const list = sortNotes(get(notes));
  const n = Number(query);
  if (Number.isInteger(n) && n >= 1) return list[n - 1];
  const q = query.toLowerCase();
  return list.find((x) => titleOf(x).toLowerCase().startsWith(q)) ?? list.find((x) => titleOf(x).toLowerCase().includes(q));
}

export function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d}d ago` : new Date(ts).toLocaleDateString();
}
