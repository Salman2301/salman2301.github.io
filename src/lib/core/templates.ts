import { get } from 'svelte/store';
import { col, leaf, leaves, row, setLayout, workspace, type PaneNode } from './workspace';
import { getWidget } from './registry';
import { persisted } from './storage';

/**
 * Layout templates. A template is just a pane tree; `setLayout` clones it
 * with fresh ids. Widget ids that are not installed render a placeholder.
 */
export interface TemplateDef {
  id: string;
  title: string;
  description: string;
  build: () => PaneNode;
  /** true for templates the visitor saved themselves. */
  custom?: boolean;
}

export const builtinTemplates: TemplateDef[] = [
  {
    id: 'classic',
    title: 'Classic',
    description: 'One full-screen terminal. The original.',
    build: () => leaf('terminal', { startup: ['whoami', 'motd'] }),
  },
  {
    id: 'duo',
    title: 'Duo',
    description: 'Two terminals side by side.',
    build: () => row([leaf('terminal', { startup: ['whoami'] }), leaf('terminal', { startup: ['help'] })], [0.55, 0.45]),
  },
  {
    id: 'morning',
    title: 'Morning Brief',
    description: 'Hacker News, your tasks and a pomodoro to get going.',
    build: () => row([leaf('news'), col([leaf('pomodoro'), leaf('todo')], [0.55, 0.45])], [0.55, 0.45]),
  },
  {
    id: 'writer',
    title: 'Writer',
    description: 'Markdown notes with a terminal on the side.',
    build: () => row([leaf('notes', { mode: 'split' }), leaf('terminal', { startup: ['notes ls'] })], [0.68, 0.32]),
  },
  {
    id: 'playground',
    title: 'Playground',
    description: 'The arcade next to a terminal.',
    build: () => row([leaf('arcade'), leaf('terminal', { startup: ['scores'] })], [0.62, 0.38]),
  },
  {
    id: 'focus',
    title: 'Deep Focus',
    description: 'Pomodoro and a task list next to your notes.',
    build: () => row([col([leaf('pomodoro'), leaf('todo')], [0.45, 0.55]), leaf('notes')], [0.38, 0.62]),
  },
  {
    id: 'study',
    title: 'Study Radio',
    description: 'Live radio, pomodoro and markdown notes.',
    build: () => row([col([leaf('radio'), leaf('pomodoro')], [0.6, 0.4]), leaf('notes')], [0.55, 0.45]),
  },
  {
    id: 'dev',
    title: 'Dev Desk',
    description: 'A big terminal with notes and a stopwatch on the side.',
    build: () => row([leaf('terminal', { startup: ['neofetch'] }), col([leaf('notes'), leaf('timer')], [0.62, 0.38])], [0.62, 0.38]),
  },
  {
    id: 'arcade',
    title: 'Arcade',
    description: 'The game library, a terminal and some music.',
    build: () => row([leaf('arcade'), col([leaf('spotify'), leaf('terminal', { startup: ['games'] })], [0.5, 0.5])], [0.64, 0.36]),
  },
  {
    id: 'music',
    title: 'Music Room',
    description: 'Spotify and a free radio station side by side, with a clock.',
    build: () => row([col([leaf('spotify'), leaf('radio')]), col([leaf('clock'), leaf('terminal')], [0.4, 0.6])], [0.6, 0.4]),
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    description: 'Clock, timers, notes, tasks and music in one grid.',
    build: () =>
      col(
        [row([leaf('clock'), leaf('pomodoro'), leaf('timer')]), row([leaf('notes'), leaf('todo'), leaf('radio')])],
        [0.42, 0.58],
      ),
  },
  {
    id: 'zen',
    title: 'Zen',
    description: 'Digital rain, a clock and a pomodoro. Breathe.',
    build: () => row([leaf('matrix'), col([leaf('clock'), leaf('pomodoro')])], [0.6, 0.4]),
  },
  {
    id: 'hacker',
    title: 'Hacker',
    description: 'Two terminals and digital rain. Looks busy.',
    build: () =>
      row([leaf('terminal', { startup: ['neofetch'] }), col([leaf('matrix'), leaf('terminal', { startup: ['hack'] })])], [0.55, 0.45]),
  },
];

/* ---------------------------------------------------------- custom ones */

interface SavedTemplate {
  id: string;
  title: string;
  root: PaneNode;
}

export const savedTemplates = persisted<SavedTemplate[]>('templates:custom', []);

export function allTemplates(saved: SavedTemplate[] = get(savedTemplates)): TemplateDef[] {
  const custom = saved.map<TemplateDef>((t) => ({
    id: t.id,
    title: t.title,
    description: 'Saved by you.',
    build: () => t.root,
    custom: true,
  }));
  // Hide built-in templates that need widgets which are not installed yet.
  const available = builtinTemplates.filter((t) => leaves(t.build()).every((l) => getWidget(l.widget)));
  return [...available, ...custom];
}

export function findTemplate(id: string): TemplateDef | undefined {
  const needle = id.toLowerCase();
  return allTemplates().find((t) => t.id === needle || t.title.toLowerCase() === needle);
}

export function applyTemplate(id: string): boolean {
  const t = findTemplate(id);
  if (!t) return false;
  setLayout(t.build(), t.id);
  return true;
}

function slug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Save the current layout as a custom template. Returns its id. */
export function saveCurrentAsTemplate(name: string): string | null {
  const id = slug(name);
  if (!id || builtinTemplates.some((t) => t.id === id)) return null;
  const root = JSON.parse(JSON.stringify(get(workspace).root)) as PaneNode;
  savedTemplates.update((list) => [...list.filter((t) => t.id !== id), { id, title: name, root }]);
  workspace.update((s) => ({ ...s, template: id }));
  return id;
}

export function deleteTemplate(id: string): boolean {
  const before = get(savedTemplates).length;
  savedTemplates.update((list) => list.filter((t) => t.id !== id));
  return get(savedTemplates).length !== before;
}
