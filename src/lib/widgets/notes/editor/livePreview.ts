import { autocompletion, completionKeymap, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { HighlightStyle, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { EditorSelection, StateEffect, type EditorState, type Extension, type Range } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import { tags } from '@lezer/highlight';
import { relativeDay } from '../../../core/dates';
import { candidates, mentionRanges, type MentionRange } from '../../../core/mentions';

/**
 * Obsidian-style live preview for the notes editor (CodeMirror 6).
 *
 * Every line is shown rendered (headings sized, **marks** hidden, links as
 * links, list bullets, checkboxes, rules, [@task:] / [@date:] chips) except
 * the line the cursor is on, which shows its markdown source so it can be
 * edited. A fenced code block reveals its fences while the cursor is inside
 * it. With the editor unfocused everything is rendered.
 */

/** Dispatch to redraw chips after tasks or notes changed (their labels are live). */
export const refreshChips = StateEffect.define<null>();

/* ------------------------------------------------------------- widgets */

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-lp-bullet';
    s.textContent = '•';
    return s;
  }
}

class RuleWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-lp-hr';
    return s;
  }
}

/** A real checkbox for "- [ ]" / "- [x]"; clicking it edits the text. */
class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly pos: number) {
    super();
  }
  eq(other: CheckboxWidget) {
    return other.checked === this.checked && other.pos === this.pos;
  }
  toDOM(view: EditorView) {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'cm-lp-check';
    box.checked = this.checked;
    box.setAttribute('aria-label', this.checked ? 'Done' : 'Not done');
    box.addEventListener('mousedown', (e) => e.preventDefault());
    box.addEventListener('click', (e) => {
      e.preventDefault();
      view.dispatch({ changes: { from: this.pos + 1, to: this.pos + 2, insert: this.checked ? ' ' : 'x' } });
    });
    return box;
  }
  ignoreEvent() {
    return true;
  }
}

/**
 * A [@task:] / [@date:] / [@note:] link drawn as a chip, with the same markup
 * as the reading view, so the notes widget's click, hover and right-click
 * handlers work on both.
 */
class ChipWidget extends WidgetType {
  constructor(readonly m: MentionRange) {
    super();
  }
  eq(other: ChipWidget) {
    const a = this.m;
    const b = other.m;
    return a.kind === b.kind && a.id === b.id && a.label === b.label && a.missing === b.missing && a.done === b.done && a.ref === b.ref;
  }
  toDOM() {
    const m = this.m;
    const chip = document.createElement('span');
    chip.className = ['mention', m.kind, m.missing ? 'missing' : '', m.done ? 'done' : '', m.time ? 'time' : ''].filter(Boolean).join(' ');
    chip.dataset.kind = m.kind;
    chip.dataset.id = m.id;
    chip.dataset.ref = m.ref;
    // Keep the caret where it is: a click opens the link instead of editing it.
    chip.addEventListener('mousedown', (e) => e.preventDefault());
    const ico = document.createElement('span');
    ico.className = 'ico';
    const lbl = document.createElement('span');
    lbl.className = 'lbl';
    lbl.textContent = m.label;
    chip.append(ico, lbl);
    if (m.kind === 'date' && !m.missing) {
      const rel = document.createElement('span');
      rel.className = 'rel';
      rel.textContent = relativeDay(m.id);
      chip.append(rel);
    }
    return chip;
  }
  ignoreEvent() {
    return true;
  }
}

/* --------------------------------------------------------- decorations */

const hide = Decoration.replace({});
const mark = (cls: string, attributes?: Record<string, string>) => Decoration.mark({ class: cls, attributes });
const line = (cls: string) => Decoration.line({ class: cls });

/** Lines that show their source: those touched by the selection, while focused. */
export function activeLines(view: EditorView): Set<number> {
  const out = new Set<number>();
  if (!view.hasFocus) return out;
  const { doc, selection } = view.state;
  for (const r of selection.ranges) {
    const a = doc.lineAt(r.from).number;
    const b = doc.lineAt(r.to).number;
    for (let n = a; n <= b; n++) out.add(n);
  }
  return out;
}

const CODE_NODES = new Set(['InlineCode', 'FencedCode', 'CodeBlock', 'CodeText']);

/** Whether a position is inside code, where links and chips stay plain text. */
export function inCode(state: EditorState, pos: number): boolean {
  for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1); n; n = n.parent) {
    if (CODE_NODES.has(n.name)) return true;
  }
  return false;
}

/** Only links that open somewhere sensible. */
function safeHref(url: string): string | null {
  const u = url.trim().replace(/^<|>$/g, '');
  if (/^(https?:|mailto:)/i.test(u)) return u;
  if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(u)) return `https://${u}`;
  return null;
}

function build(view: EditorView): DecorationSet {
  const { state } = view;
  const doc = state.doc;
  const active = activeLines(view);
  const isActive = (from: number, to: number) => {
    const a = doc.lineAt(from).number;
    const b = doc.lineAt(Math.max(from, to)).number;
    for (let n = a; n <= b; n++) if (active.has(n)) return true;
    return false;
  };
  const out: Range<Decoration>[] = [];
  /** `to`, plus the space after it if there is one. */
  const withSpace = (to: number) => (doc.sliceString(to, to + 1) === ' ' ? to + 1 : to);
  const hideWithSpace = (from: number, to: number) => out.push(hide.range(from, withSpace(to)));

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(ref) {
        const name = ref.name;
        const node = ref.node;
        const parent = node.parent?.name ?? '';

        const heading = /^ATXHeading(\d)$/.exec(name);
        if (heading) {
          out.push(line(`cm-lp-h cm-lp-h${heading[1]}`).range(doc.lineAt(ref.from).from));
          return;
        }

        switch (name) {
          case 'HeaderMark':
            if (!isActive(ref.from, ref.to)) hideWithSpace(ref.from, ref.to);
            return;
          case 'StrongEmphasis':
            out.push(mark('cm-lp-strong').range(ref.from, ref.to));
            return;
          case 'Emphasis':
            out.push(mark('cm-lp-em').range(ref.from, ref.to));
            return;
          case 'Strikethrough':
            out.push(mark('cm-lp-strike').range(ref.from, ref.to));
            return;
          case 'InlineCode':
            out.push(mark('cm-lp-code').range(ref.from, ref.to));
            return;
          case 'EmphasisMark':
          case 'StrikethroughMark':
            if (!isActive(ref.from, ref.to)) out.push(hide.range(ref.from, ref.to));
            return;
          case 'CodeMark':
            if (parent === 'InlineCode' && !isActive(ref.from, ref.to)) out.push(hide.range(ref.from, ref.to));
            return;
          case 'Link': {
            const url = node.getChild('URL');
            const marks = node.getChildren('LinkMark');
            const href = url ? safeHref(doc.sliceString(url.from, url.to)) : null;
            // [text](url): the text is the link; the brackets and url hide away.
            if (marks.length >= 2 && href) {
              out.push(mark('cm-lp-link', { 'data-href': href, title: href }).range(marks[0].to, marks[1].from));
              if (!isActive(ref.from, ref.to)) {
                out.push(hide.range(ref.from, marks[0].to));
                out.push(hide.range(marks[1].from, ref.to));
              }
            }
            return false;
          }
          case 'URL': {
            // bare links (https://...) and <autolinks>
            if (parent === 'Link' || parent === 'Image') return;
            const href = safeHref(doc.sliceString(ref.from, ref.to));
            if (href) out.push(mark('cm-lp-link', { 'data-href': href, title: href }).range(ref.from, ref.to));
            return;
          }
          case 'Blockquote':
            for (let p = ref.from; p <= ref.to; ) {
              const l = doc.lineAt(p);
              out.push(line('cm-lp-quote').range(l.from));
              p = l.to + 1;
            }
            return;
          case 'QuoteMark':
            if (!isActive(ref.from, ref.to)) hideWithSpace(ref.from, ref.to);
            return;
          case 'ListMark': {
            if (isActive(ref.from, ref.to)) return;
            const item = node.parent;
            const task = item?.getChild('Task');
            if (task) hideWithSpace(ref.from, ref.to); // the checkbox stands in for the bullet
            else if (item?.parent?.name === 'BulletList') out.push(Decoration.replace({ widget: new BulletWidget() }).range(ref.from, withSpace(ref.to)));
            else out.push(mark('cm-lp-num').range(ref.from, ref.to));
            return;
          }
          case 'TaskMarker':
            if (!isActive(ref.from, ref.to)) {
              const checked = /x/i.test(doc.sliceString(ref.from + 1, ref.from + 2));
              const end = withSpace(ref.to);
              out.push(Decoration.replace({ widget: new CheckboxWidget(checked, ref.from) }).range(ref.from, end));
              if (checked) {
                const l = doc.lineAt(ref.from);
                if (end < l.to) out.push(mark('cm-lp-done').range(end, l.to));
              }
            }
            return;
          case 'HorizontalRule':
            if (!isActive(ref.from, ref.to)) out.push(Decoration.replace({ widget: new RuleWidget() }).range(ref.from, ref.to));
            return;
          case 'FencedCode': {
            const open = isActive(ref.from, ref.to);
            const first = doc.lineAt(ref.from).number;
            const last = doc.lineAt(ref.to).number;
            for (let n = first; n <= last; n++) {
              const l = doc.line(n);
              const fence = n === first || (n === last && /^\s*(```|~~~)/.test(l.text));
              out.push(line(`cm-lp-codeblock${n === first ? ' cm-lp-code-first' : ''}${n === last ? ' cm-lp-code-last' : ''}${fence && !open ? ' cm-lp-fence' : ''}`).range(l.from));
            }
            return false;
          }
        }
        return;
      },
    });

    // [@task: #12], [@date: ...], [@time: ...], [@note: ...] as chips
    const text = doc.sliceString(from, to);
    for (const m of mentionRanges(text)) {
      const a = from + m.from;
      const b = from + m.to;
      if (isActive(a, b) || inCode(state, a)) continue;
      out.push(Decoration.replace({ widget: new ChipWidget({ ...m, from: a, to: b }) }).range(a, b));
    }
  }
  return Decoration.set(out, true);
}

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.selectionSet || u.focusChanged || u.transactions.some((t) => t.effects.some((e) => e.is(refreshChips)))) {
        this.decorations = build(u.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      // Like Obsidian: clicking a rendered link opens it; click elsewhere on the line to edit it.
      mousedown(e: MouseEvent, view: EditorView) {
        const el = (e.target as HTMLElement).closest<HTMLElement>('.cm-lp-link');
        const href = el?.dataset.href;
        if (!el || !href || e.button !== 0 || e.shiftKey) return false;
        const lineNo = view.state.doc.lineAt(view.posAtDOM(el)).number;
        if (activeLines(view).has(lineNo) && !(e.metaKey || e.ctrlKey)) return false;
        e.preventDefault();
        window.open(href, '_blank', 'noopener,noreferrer');
        return true;
      },
    },
  },
);

/** Live preview: rendered markdown with the cursor's line as source. */
export function livePreview(): Extension {
  return livePreviewPlugin;
}

/* --------------------------------------------------------- highlighting */

/** Source-mode colours (and the marks on the line being edited), from the theme. */
export const markdownHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.heading, fontWeight: '700', color: 'var(--t2)' },
    { tag: tags.strong, fontWeight: '700' },
    { tag: tags.emphasis, fontStyle: 'italic' },
    { tag: tags.strikethrough, textDecoration: 'line-through' },
    { tag: tags.link, color: 'var(--hl1)' },
    { tag: tags.url, color: 'var(--t1)' },
    { tag: tags.monospace, fontFamily: 'var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace)' },
    { tag: tags.quote, color: 'var(--t1)' },
    { tag: tags.processingInstruction, color: 'var(--t1)' },
    { tag: tags.meta, color: 'var(--t1)' },
    { tag: tags.contentSeparator, color: 'var(--t1)' },
  ]),
);

/* --------------------------------------------------------------- @ list */

/**
 * @ opens a list at the caret: date words (@time, @date, @tmrw, ...), "pick a
 * date…", and tasks. Picking writes [@time: ...], [@date: ...] or [@task: #n].
 */
export function mentionSource(onAction: (action: 'pick-date' | 'pick-time', pos: number) => void) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const m = ctx.matchBefore(/@[^\s@[\]()]*/);
    if (!m) return null;
    const before = m.from > 0 ? ctx.state.sliceDoc(m.from - 1, m.from) : '';
    if (before && !/\s/.test(before)) return null; // an email address, not a mention
    if (inCode(ctx.state, m.from)) return null;
    const items = candidates('task', m.text.slice(1), { actions: true, limit: 12 });
    if (!items.length) return null;
    return {
      from: m.from,
      filter: false,
      options: items.map((c, i) => ({
        label: c.label,
        detail: c.detail,
        type: c.kind,
        boost: 99 - i,
        apply: (view: EditorView, _c: unknown, from: number, to: number) => {
          if (c.action) {
            view.dispatch({ changes: { from, to, insert: '' } });
            onAction(c.action, from);
            return;
          }
          const insert = `${c.insert} `;
          view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length } });
        },
      })),
    };
  };
}

export function mentionCompletion(onAction: (action: 'pick-date' | 'pick-time', pos: number) => void): Extension {
  return [autocompletion({ override: [mentionSource(onAction)], icons: false, defaultKeymap: false }), keymap.of(completionKeymap)];
}

/* --------------------------------------------------------------- keys */

/** Mod-B / Mod-I: wrap the selection (or an empty pair at the caret) in ** or _. */
export function wrapWith(markText: string) {
  const n = markText.length;
  return (view: EditorView) => {
    view.dispatch(
      view.state.changeByRange((r) => ({
        changes: [
          { from: r.from, insert: markText },
          { from: r.to, insert: markText },
        ],
        range: EditorSelection.range(r.from + n, r.to + n),
      })),
    );
    return true;
  };
}

/* --------------------------------------------------------------- theme */

export const editorTheme = EditorView.theme({
  '&': { height: '100%', color: 'var(--t2)', backgroundColor: 'transparent', fontSize: '14px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.7', padding: '14px 0 40vh' },
  '.cm-content': { caretColor: 'var(--hl1)', padding: '0 20px', maxWidth: '780px' },
  '.cm-line': { padding: '0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--hl1)', borderLeftWidth: '2px' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--hl1) 24%, transparent) !important',
  },
  '.cm-placeholder': { color: 'var(--t1)', fontStyle: 'normal' },

  // rendered markdown
  '.cm-lp-h': { fontWeight: '700', color: 'var(--t2)', lineHeight: '1.35' },
  '.cm-lp-h1': { fontSize: '1.75em', padding: '0.4em 0 0.15em' },
  '.cm-lp-h2': { fontSize: '1.45em', padding: '0.35em 0 0.1em' },
  '.cm-lp-h3': { fontSize: '1.22em', padding: '0.3em 0 0.05em' },
  '.cm-lp-h4, .cm-lp-h5, .cm-lp-h6': { fontSize: '1.05em' },
  '.cm-lp-strong': { fontWeight: '700' },
  '.cm-lp-em': { fontStyle: 'italic' },
  '.cm-lp-strike': { textDecoration: 'line-through', color: 'var(--t1)' },
  '.cm-lp-code': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '0.9em',
    padding: '1px 4px',
    borderRadius: '4px',
    backgroundColor: 'color-mix(in srgb, var(--bg2) 45%, transparent)',
  },
  '.cm-lp-link': { color: 'var(--hl1)', textDecoration: 'underline', textDecorationColor: 'color-mix(in srgb, var(--hl1) 45%, transparent)', cursor: 'pointer' },
  '.cm-lp-quote': { borderLeft: '3px solid color-mix(in srgb, var(--hl1) 60%, var(--bg2))', paddingLeft: '12px !important', color: 'var(--t1)' },
  '.cm-lp-bullet': { display: 'inline-block', width: '1.1em', color: 'var(--hl1)', fontWeight: '700' },
  '.cm-lp-num': { color: 'var(--hl1)' },
  '.cm-lp-check': { margin: '0 6px 0 0', verticalAlign: 'middle', accentColor: 'var(--hl1)', cursor: 'pointer' },
  '.cm-lp-done': { color: 'var(--t1)', textDecoration: 'line-through' },
  '.cm-lp-hr': { display: 'inline-block', width: '100%', height: '0', borderTop: '1px solid var(--bg2)', verticalAlign: 'middle' },
  '.cm-lp-codeblock': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '0.9em',
    backgroundColor: 'color-mix(in srgb, var(--bg2) 30%, transparent)',
    padding: '0 12px !important',
  },
  '.cm-lp-code-first': { borderTopLeftRadius: '6px', borderTopRightRadius: '6px' },
  '.cm-lp-code-last': { borderBottomLeftRadius: '6px', borderBottomRightRadius: '6px' },
  '.cm-lp-fence': { color: 'transparent', fontSize: '0.5em', lineHeight: '0.9' },

  // the @ list
  '.cm-tooltip': {
    backgroundColor: 'var(--bg1)',
    border: '1px solid var(--bg2)',
    borderRadius: '8px',
    color: 'var(--t2)',
    boxShadow: '0 12px 30px -12px color-mix(in srgb, var(--bg2) 75%, transparent)',
    overflow: 'hidden',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': { fontFamily: 'inherit', fontSize: '12px', maxHeight: '240px', minWidth: '240px' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { padding: '4px 10px', lineHeight: '1.4' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'color-mix(in srgb, var(--hl1) 16%, transparent)',
    color: 'var(--hl1)',
  },
  '.cm-completionDetail': { marginLeft: '12px', color: 'var(--t1)', fontStyle: 'normal', float: 'right' },
  '.cm-completionMatchedText': { textDecoration: 'none', fontWeight: '700' },
});
