import { get } from 'svelte/store';
import { runInTerminal } from '../terminal/context';
import { notes, titleOf, type Note } from '../widgets/notes/store';
import { STATIONS } from '../widgets/radio/stations';
import { tune } from '../widgets/radio/player';
import { friendlyDate } from './dates';
import { openMention } from './mentions';
import { commands, games, widgets } from './registry';
import { repeatLabel } from './repeat';
import { ALL, chooseTheme, setActiveSpace, spaceName } from './spaces';
import { projectOf, projects, tasks, type Project, type Task } from './tasks';
import { themeNames } from './theme';
import { openWidget } from './workspace';

/**
 * Global search (⌘K / Ctrl+K): one list over tasks, notes, commands,
 * widgets, games, themes, radio stations and spaces. Each result knows how
 * to open itself.
 *
 * Query prefixes narrow it: "#" tasks (#12 finds task 12), "/" notes,
 * ">" commands (Enter runs the typed line in a terminal).
 */

export type ResultKind = 'task' | 'note' | 'command' | 'widget' | 'game' | 'theme' | 'station' | 'space' | 'run';

export interface Result {
  key: string;
  kind: ResultKind;
  title: string;
  /** A second line: a note snippet, a command's description, a task's space. */
  detail?: string;
  /** Short text on the right: the space, a due date, "done". */
  meta?: string;
  /** Tasks: done ones are dimmed. */
  dim?: boolean;
  score: number;
  open: () => void;
}

/* ---------------------------------------------------------------- scoring */

/**
 * How well `q` (lower case, trimmed, non-empty) matches `text`: the whole
 * text, its start, the start of a word, anywhere, or as letters in order
 * ("tmr" in "timer"). 0 is no match.
 */
export function matchScore(q: string, text: string): number {
  const t = text.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 80 - Math.min(20, t.length - q.length) / 2;
  const i = t.indexOf(q);
  if (i > 0 && /[\s\-_/.:#([]/.test(t[i - 1])) return 60;
  if (i > 0) return 40;
  if (q.length < 3) return 0;
  // letters in order, close together
  let pos = -1;
  let gaps = 0;
  for (const ch of q) {
    const next = t.indexOf(ch, pos + 1);
    if (next < 0) return 0;
    if (pos >= 0) gaps += next - pos - 1;
    pos = next;
  }
  return gaps > q.length * 3 ? 0 : Math.max(5, 25 - gaps);
}

/** Every word of the query must match one of the fields; the score adds up. Fields after the first count less. */
function scoreFields(words: string[], fields: (string | undefined)[]): number {
  let total = 0;
  for (const w of words) {
    let best = 0;
    fields.forEach((f, i) => {
      if (!f) return;
      const raw = matchScore(w, f);
      // letters-in-order matches only count on the name, not on descriptions and bodies
      const s = i === 0 ? raw : raw >= 40 ? raw * 0.6 : 0;
      if (s > best) best = s;
    });
    if (!best) return 0;
    total += best;
  }
  return total / words.length;
}

/** A short piece of `body` around the first match of `q`, on one line. */
export function snippet(body: string, q: string, width = 80): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  const i = q ? flat.toLowerCase().indexOf(q) : -1;
  if (i < 0) return flat.slice(0, width) + (flat.length > width ? '…' : '');
  const start = Math.max(0, i - Math.floor(width / 3));
  const out = flat.slice(start, start + width);
  return (start > 0 ? '…' : '') + out + (start + width < flat.length ? '…' : '');
}

/** Note text without link tokens, so a search for "task" does not match every [@task: #3]. */
const plain = (body: string) =>
  body
    .replace(/\[@(?:task|note|date|time):\s*([^\]|]*?)(?:\s*\|\s*([^\]]*))?\]/g, (_, a: string, b?: string) => b ?? a)
    .replace(/@\[([^\]]*)\]\([^)]*\)/g, '$1');

/* ---------------------------------------------------------------- sources */

function taskResult(t: Task, score: number, spaces: Project[]): Result {
  const parent = t.parentId ? get(tasks).find((p) => p.id === t.parentId) : undefined;
  const bits = [t.done ? 'done' : t.due ? friendlyDate(t.due) : '', t.repeat ? `↻ ${repeatLabel(t.repeat)}` : ''].filter(Boolean);
  return {
    key: `task:${t.id}`,
    kind: 'task',
    title: `#${t.no} ${plain(t.text)}`,
    detail: [spaceName(spaces, projectOf(t)), parent ? `under #${parent.no}` : '', t.notes ? snippet(t.notes, '', 60) : ''].filter(Boolean).join(' · '),
    meta: bits.join(' '),
    dim: t.done,
    score,
    open: () => openMention('task', t.id),
  };
}

function noteResult(n: Note, q: string, score: number, spaces: Project[]): Result {
  const body = plain(n.body);
  return {
    key: `note:${n.id}`,
    kind: 'note',
    title: titleOf(n),
    detail: snippet(body.split('\n').slice(1).join('\n') || body, q),
    meta: spaceName(spaces, n.spaceId ?? 'inbox'),
    score,
    open: () => openMention('note', n.id),
  };
}

/** Results for a query, best first. An empty query lists open tasks and recent notes. */
export function search(query: string, limit = 40): Result[] {
  const raw = query.trim();
  let mode: 'all' | 'task' | 'note' | 'command' = 'all';
  let q = raw.toLowerCase();
  if (q.startsWith('#')) mode = 'task';
  else if (q.startsWith('/')) mode = 'note';
  else if (q.startsWith('>')) mode = 'command';
  if (mode !== 'all') q = q.slice(1).trim();
  const words = q.split(/\s+/).filter(Boolean);
  const spaces = get(projects);
  const out: Result[] = [];

  if (!words.length) {
    if (mode === 'all' || mode === 'task') {
      get(tasks)
        .filter((t) => !t.done)
        .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || b.no - a.no)
        .slice(0, mode === 'task' ? limit : 6)
        .forEach((t, i) => out.push(taskResult(t, 50 - i, spaces)));
    }
    if (mode === 'all' || mode === 'note') {
      [...get(notes)]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, mode === 'note' ? limit : 6)
        .forEach((n, i) => out.push(noteResult(n, '', 40 - i, spaces)));
    }
    if (mode === 'command') {
      for (const c of commands.filter((c) => !c.hidden)) out.push(commandResult(c, 10));
    }
    return out.slice(0, limit);
  }

  if (mode === 'all' || mode === 'task') {
    // "#12" or "12": task 12 first.
    const no = /^\d+$/.test(q) ? Number(q) : NaN;
    for (const t of get(tasks)) {
      if (t.no === no) {
        out.push(taskResult(t, 1000, spaces));
        continue;
      }
      const s = scoreFields(words, [t.text, `#${t.no}`, t.notes, spaceName(spaces, projectOf(t))]);
      if (s) out.push(taskResult(t, s - (t.done ? 15 : 0), spaces));
    }
  }
  if (mode === 'all' || mode === 'note') {
    for (const n of get(notes)) {
      const s = scoreFields(words, [titleOf(n), plain(n.body)]);
      if (s) out.push(noteResult(n, words[0], s, spaces));
    }
  }
  if (mode === 'all' || mode === 'command') {
    for (const c of commands) {
      if (c.hidden) continue;
      const s = scoreFields(words, [c.name, ...(c.aliases ?? []), c.description]);
      if (s) out.push(commandResult(c, s));
    }
    // ">theme nord" or "theme nord": run exactly what was typed.
    const first = words[0];
    const cmd = commands.find((c) => c.name === first || c.aliases?.includes(first));
    if (cmd && (words.length > 1 || mode === 'command')) {
      const line = raw.replace(/^>\s*/, '');
      out.push({ key: `run:${line}`, kind: 'run', title: line, detail: 'run in the terminal', score: 200, open: () => void runInTerminal(line) });
    }
  }
  if (mode === 'all') {
    for (const w of widgets) {
      if (w.hidden) continue;
      const s = scoreFields(words, [w.title, w.id, ...(w.keywords ?? []), w.description]);
      if (s) out.push({ key: `widget:${w.id}`, kind: 'widget', title: w.title, detail: w.description, meta: w.icon, score: s + 5, open: () => void openWidget(w.id) });
    }
    for (const g of games) {
      const s = scoreFields(words, [g.title, g.id, g.description]);
      if (s) out.push({ key: `game:${g.id}`, kind: 'game', title: `play ${g.title}`, detail: g.description, score: s, open: () => void openWidget('arcade', { game: g.id }) });
    }
    for (const name of themeNames) {
      const s = scoreFields(words, [name, 'theme']);
      if (s) out.push({ key: `theme:${name}`, kind: 'theme', title: name, detail: 'switch to this theme', score: s - 5, open: () => void chooseTheme(name) });
    }
    for (const st of STATIONS) {
      const s = scoreFields(words, [st.name, st.slug, 'radio', st.note]);
      if (s) out.push({ key: `station:${st.slug}`, kind: 'station', title: `radio: ${st.name}`, detail: st.note, score: s - 5, open: () => tune(st) });
    }
    for (const p of [{ id: ALL, name: 'All spaces' }, ...spaces]) {
      const s = scoreFields(words, [p.name, 'space']);
      if (s) out.push({ key: `space:${p.id}`, kind: 'space', title: `space: ${p.name}`, detail: 'pin this tab to the space', score: s, open: () => setActiveSpace(p.id) });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

function commandResult(c: (typeof commands)[number], score: number): Result {
  return {
    key: `command:${c.name}`,
    kind: 'command',
    title: c.usage ?? c.name,
    detail: c.description,
    score,
    open: () => void runInTerminal(c.name),
  };
}
