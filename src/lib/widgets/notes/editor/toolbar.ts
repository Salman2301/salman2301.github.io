import { codeFolding, foldable, foldedRanges, foldEffect, foldService, unfoldEffect } from '@codemirror/language';
import { EditorSelection, StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
import { Decoration, EditorView, keymap, showTooltip, ViewPlugin, WidgetType, type DecorationSet, type Tooltip, type ViewUpdate } from '@codemirror/view';
import { DETAILS_CLOSE, DETAILS_OPEN, SUMMARY_LINE, toAccordion, toList, type ListKind } from './blocks';
import { activeLines } from './livePreview';

/**
 * The notes selection toolbar (bullet / numbered / check list, accordion),
 * their keyboard shortcuts, and accordions (<details>) in live preview: the
 * tags hide, the title gets a ▸ / ▾ toggle, and the content folds.
 */

/* ------------------------------------------------------------ commands */

/** The whole lines the selection touches (a selection ending at a line start leaves that line out). */
function selectedLines(state: EditorState) {
  const r = state.selection.main;
  const a = state.doc.lineAt(r.from);
  let b = state.doc.lineAt(r.to);
  if (b.number > a.number && r.to === b.from) b = state.doc.line(b.number - 1);
  return { from: a.from, to: b.to, lines: state.doc.sliceString(a.from, b.to).split('\n') };
}

export function listCommand(kind: ListKind) {
  return (view: EditorView) => {
    const { from, to, lines } = selectedLines(view.state);
    const text = toList(lines, kind).join('\n');
    view.dispatch({ changes: { from, to, insert: text }, selection: EditorSelection.range(from, from + text.length), userEvent: 'input.format' });
    view.focus();
    return true;
  };
}

export function accordionCommand(view: EditorView) {
  const { from, to, lines } = selectedLines(view.state);
  const { text, bodyOffset } = toAccordion(lines);
  view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + bodyOffset }, userEvent: 'input.format' });
  view.focus();
  return true;
}

/* ------------------------------------------------------------- toolbar */

const TOOLS: { label: string; title: string; run: (view: EditorView) => boolean }[] = [
  { label: '• list', title: 'Bullet list (Mod+Shift+8)', run: listCommand('bullet') },
  { label: '1. list', title: 'Numbered list (Mod+Shift+7)', run: listCommand('number') },
  { label: '☐ checklist', title: 'Check list (Mod+Shift+9)', run: listCommand('check') },
  { label: '▸ accordion', title: 'Fold into an accordion: the first line is the title', run: accordionCommand },
];

function toolbarDom(view: EditorView): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'cm-sel-toolbar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Format selection');
  for (const t of TOOLS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t.label;
    b.title = t.title;
    // keep the selection: act on click, never let the button take it
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => t.run(view));
    bar.append(b);
  }
  return bar;
}

function toolbarFor(state: EditorState): readonly Tooltip[] {
  const r = state.selection.main;
  if (r.empty || state.selection.ranges.length > 1) return [];
  return [{ pos: r.from, above: true, strictSide: false, arrow: false, create: (view) => ({ dom: toolbarDom(view), offset: { x: 0, y: 6 } }) }];
}

const toolbarField = StateField.define<readonly Tooltip[]>({
  create: toolbarFor,
  update: (tips, tr) => (tr.docChanged || tr.selection ? toolbarFor(tr.state) : tips),
  provide: (f) => showTooltip.computeN([f], (s) => s.field(f)),
});

/* ---------------------------------------------------------- accordions */

/** The summary line folds everything up to its matching </details>. */
const accordionFolds = foldService.of((state, lineStart) => {
  const line = state.doc.lineAt(lineStart);
  if (!SUMMARY_LINE.test(line.text) || line.number < 2 || !DETAILS_OPEN.test(state.doc.line(line.number - 1).text)) return null;
  let depth = 1;
  for (let n = line.number + 1; n <= state.doc.lines; n++) {
    const text = state.doc.line(n).text;
    if (DETAILS_OPEN.test(text)) depth++;
    else if (DETAILS_CLOSE.test(text) && --depth === 0) return { from: line.to, to: state.doc.line(n).to };
  }
  return null;
});

/** The ▸ / ▾ in front of an accordion title; clicking folds or unfolds it. */
class ToggleWidget extends WidgetType {
  constructor(readonly open: boolean, readonly lineFrom: number) {
    super();
  }
  eq(other: ToggleWidget) {
    return other.open === this.open && other.lineFrom === this.lineFrom;
  }
  toDOM(view: EditorView) {
    const b = document.createElement('span');
    b.className = 'cm-lp-toggle';
    b.textContent = this.open ? '▾' : '▸';
    b.setAttribute('role', 'button');
    b.setAttribute('aria-label', this.open ? 'Fold' : 'Unfold');
    b.addEventListener('mousedown', (e) => {
      e.preventDefault();
      toggleAt(view, this.lineFrom);
    });
    return b;
  }
  ignoreEvent() {
    return true;
  }
}

function foldedAt(state: EditorState, from: number, to: number): boolean {
  let hit = false;
  foldedRanges(state).between(from, to, (a, b) => {
    if (a === from && b === to) hit = true;
  });
  return hit;
}

function toggleAt(view: EditorView, lineFrom: number) {
  const line = view.state.doc.lineAt(lineFrom);
  const range = foldable(view.state, line.from, line.to);
  if (!range) return;
  view.dispatch({ effects: (foldedAt(view.state, range.from, range.to) ? unfoldEffect : foldEffect).of(range) });
}

const hide = Decoration.replace({});

function accordionDecorations(view: EditorView): DecorationSet {
  const { state } = view;
  const active = activeLines(view);
  const out: Range<Decoration>[] = [];
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = state.doc.lineAt(pos);
      pos = line.to + 1;
      if (active.has(line.number)) continue;
      if (DETAILS_OPEN.test(line.text) || DETAILS_CLOSE.test(line.text)) {
        out.push(Decoration.line({ class: 'cm-lp-tagline' }).range(line.from));
        if (line.length) out.push(hide.range(line.from, line.to));
        continue;
      }
      const m = SUMMARY_LINE.exec(line.text);
      if (!m) continue;
      const range = foldable(state, line.from, line.to);
      if (!range) continue;
      const open = !foldedAt(state, range.from, range.to);
      const startTag = line.text.indexOf('<summary>');
      const endTag = line.text.toLowerCase().lastIndexOf('</summary>');
      out.push(Decoration.line({ class: 'cm-lp-summary' }).range(line.from));
      out.push(Decoration.replace({ widget: new ToggleWidget(open, line.from) }).range(line.from, line.from + startTag + '<summary>'.length));
      out.push(hide.range(line.from + endTag, line.to));
    }
  }
  return Decoration.set(out, true);
}

const accordionPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = accordionDecorations(view);
    }
    update(u: ViewUpdate) {
      const folding = u.transactions.some((t) => t.effects.some((e) => e.is(foldEffect) || e.is(unfoldEffect)));
      if (u.docChanged || u.viewportChanged || u.selectionSet || u.focusChanged || folding) this.decorations = accordionDecorations(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

/** Folding for accordions (both modes); the rendered tags and toggle only in live preview. */
export function accordions(live: boolean): Extension {
  const fold = [
    accordionFolds,
    codeFolding({
      placeholderDOM: (_view, onclick) => {
        const s = document.createElement('span');
        s.className = 'cm-lp-foldph';
        s.textContent = '…';
        s.title = 'Unfold';
        s.addEventListener('click', onclick);
        return s;
      },
    }),
  ];
  return live ? [fold, accordionPlugin] : fold;
}

/** The selection toolbar and the list shortcuts. */
export function selectionTools(): Extension {
  return [
    toolbarField,
    keymap.of([
      { key: 'Mod-Shift-8', run: listCommand('bullet') },
      { key: 'Mod-Shift-7', run: listCommand('number') },
      { key: 'Mod-Shift-9', run: listCommand('check') },
    ]),
  ];
}

export const toolbarTheme = EditorView.theme({
  // the tooltip frame (border, background, shadow) comes from the editor theme
  '.cm-sel-toolbar': { display: 'flex', gap: '2px', padding: '3px' },
  '.cm-sel-toolbar button': {
    padding: '2px 8px',
    border: 'none',
    borderRadius: '5px',
    background: 'transparent',
    color: 'var(--t2)',
    font: 'inherit',
    fontSize: '12px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  '.cm-sel-toolbar button:hover': { backgroundColor: 'color-mix(in srgb, var(--hl1) 16%, transparent)', color: 'var(--hl1)' },
  '.cm-lp-tagline': { fontSize: '0.4em', lineHeight: '0.8', color: 'transparent' },
  '.cm-lp-summary': { fontWeight: '700' },
  '.cm-lp-toggle': { display: 'inline-block', width: '1.2em', color: 'var(--hl1)', cursor: 'pointer', userSelect: 'none' },
  '.cm-lp-foldph': {
    margin: '0 4px',
    padding: '0 6px',
    borderRadius: '4px',
    backgroundColor: 'color-mix(in srgb, var(--bg2) 50%, transparent)',
    color: 'var(--t1)',
    cursor: 'pointer',
  },
});
