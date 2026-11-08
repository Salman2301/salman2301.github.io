import { get } from 'svelte/store';
import type { WidgetDef } from '../../core/types';
import Notes from './Notes.svelte';
import { notes, sortNotes, titleOf } from './store';

const widget: WidgetDef = {
  id: 'notes',
  title: 'Notes',
  description: 'Markdown notes with live preview, saved in your browser.',
  icon: '¶',
  component: Notes,
  keywords: ['markdown', 'md', 'write', 'editor', 'journal'],
  paneTitle: (config) => {
    const list = get(notes);
    const note = list.find((n) => n.id === config.noteId) ?? sortNotes(list)[0];
    return note ? `Notes · ${titleOf(note)}` : 'Notes';
  },
};

export default widget;
