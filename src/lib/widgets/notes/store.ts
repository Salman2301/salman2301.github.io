import { get } from 'svelte/store';
import { persisted } from '../../core/storage';
import { INBOX_ID } from '../../core/tasks';

export interface Note {
  id: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  /** The space the note belongs to; missing means the Inbox. */
  spaceId?: string;
  /** Position in the note list (lower first), set by dragging. */
  order?: number;
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

export const noteSpace = (n: Note): string => n.spaceId ?? INBOX_ID;

/** Pinned first, then the order set by dragging (new notes start at the top). */
export function sortNotes(list: Note[]): Note[] {
  return [...list].sort(
    (a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (a.order ?? 0) - (b.order ?? 0) || b.updatedAt - a.updatedAt,
  );
}

// Notes saved before ordering existed keep the order they had (newest first).
{
  const list = get(notes);
  if (list.some((n) => typeof n.order !== 'number')) {
    const byRecent = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
    notes.set(list.map((n) => ({ ...n, order: typeof n.order === 'number' ? n.order : byRecent.indexOf(n) })));
  }
}

export function createNote(body = '', spaceId?: string): Note {
  const t = Date.now();
  const first = Math.min(0, ...get(notes).map((n) => n.order ?? 0));
  const note: Note = { id: makeId(), body, createdAt: t, updatedAt: t, order: first - 1 };
  if (spaceId && spaceId !== INBOX_ID) note.spaceId = spaceId;
  notes.update((list) => [note, ...list]);
  return note;
}

/** Move a note to another space. */
export function moveNote(id: string, spaceId: string) {
  notes.update((list) => list.map((n) => (n.id === id ? { ...n, spaceId: spaceId === INBOX_ID ? undefined : spaceId } : n)));
}

/**
 * Put the notes `ids` in this order (a dragged list). Their slots are the
 * order values they held between them, so notes outside the list (other
 * spaces, filtered out) keep their places.
 */
export function reorderNotes(ids: string[]) {
  const list = get(notes);
  const slots = ids
    .map((id) => list.find((n) => n.id === id)?.order ?? 0)
    .sort((a, b) => a - b);
  // strictly increasing, even if two notes shared a value
  for (let i = 1; i < slots.length; i++) if (slots[i] <= slots[i - 1]) slots[i] = slots[i - 1] + 0.001;
  const next = new Map(ids.map((id, i) => [id, slots[i]] as const));
  notes.set(list.map((n) => (next.has(n.id) ? { ...n, order: next.get(n.id)! } : n)));
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
