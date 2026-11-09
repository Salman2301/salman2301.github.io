<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
  import { markdownKeymap, markdownLanguage } from '@codemirror/lang-markdown';
  import { LanguageSupport } from '@codemirror/language';
  import { Compartment, EditorState } from '@codemirror/state';
  import { drawSelection, EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
  import { editorTheme, livePreview, markdownHighlight, mentionCompletion, refreshChips, wrapWith } from './livePreview';

  /**
   * The notes editor (CodeMirror 6). Live preview renders markdown in place
   * and shows the source of the line being edited, like Obsidian; source mode
   * shows plain markdown. The parent keeps the text: `value` seeds the editor
   * whenever `docKey` (the note id) changes, and `onChange` reports edits.
   */
  export let value = '';
  export let docKey = '';
  export let live = true;
  export let placeholder = '';
  export let onChange: (text: string) => void = () => {};
  export let onSave: () => void = () => {};
  export let onBlur: () => void = () => {};
  export let onAction: (action: 'pick-date' | 'pick-time', pos: number) => void = () => {};
  /** Bump to redraw chips after tasks or notes change. */
  export let refresh = 0;

  let host: HTMLDivElement;
  let view: EditorView | undefined;
  let loadedKey = '';
  const mode = new Compartment();

  function createState(doc: string) {
    return EditorState.create({
      doc,
      extensions: [
        history(),
        drawSelection(),
        // Markdown with GFM (tasks, strikethrough, tables), without the embedded
        // HTML / CSS / JS parsers markdown() brings, which notes do not need.
        new LanguageSupport(markdownLanguage),
        markdownHighlight,
        mode.of(live ? livePreview() : []),
        mentionCompletion((action, pos) => onAction(action, pos)),
        keymap.of([
          { key: 'Mod-b', run: wrapWith('**') },
          { key: 'Mod-i', run: wrapWith('_') },
          {
            key: 'Mod-s',
            run: () => {
              onSave();
              return true;
            },
          },
          ...markdownKeymap,
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': 'Note editor', spellcheck: 'false' }),
        cmPlaceholder(placeholder),
        editorTheme,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChange(u.state.doc.toString());
          if (u.focusChanged && !u.view.hasFocus) onBlur();
        }),
      ],
    });
  }

  onMount(() => {
    view = new EditorView({ parent: host, state: createState(value) });
    loadedKey = docKey;
  });

  onDestroy(() => view?.destroy());

  // Another note: a fresh state, so undo history does not leak between notes.
  $: if (view && docKey !== loadedKey) {
    loadedKey = docKey;
    view.setState(createState(value));
  }
  $: view?.dispatch({ effects: mode.reconfigure(live ? livePreview() : []) });
  $: if (view && refresh) view.dispatch({ effects: refreshChips.of(null) });

  export function focus() {
    view?.focus();
  }

  /** Put the caret at a position (clamped) and focus. */
  export function setCursor(pos: number) {
    if (!view) return;
    view.dispatch({ selection: { anchor: Math.min(pos, view.state.doc.length) } });
    view.focus();
  }

  /** Insert text at `at` (default: the caret), leaving the caret after it. */
  export function insert(text: string, at?: number) {
    if (!view) return;
    const pos = Math.min(at ?? view.state.selection.main.head, view.state.doc.length);
    view.dispatch({ changes: { from: pos, insert: text }, selection: { anchor: pos + text.length } });
    view.focus();
  }

  /** Screen coordinates of a position (default: the caret), for popups. */
  export function coordsAt(pos?: number) {
    if (!view) return null;
    return view.coordsAtPos(pos ?? view.state.selection.main.head);
  }
</script>

<div class="live-editor" bind:this={host} />

<style>
  .live-editor {
    height: 100%;
    min-height: 0;
  }
  .live-editor :global(.cm-editor) {
    height: 100%;
  }
</style>
