import { applyMention, candidates, findMention, type Candidate } from '../core/mentions';

type Field = HTMLInputElement | HTMLTextAreaElement;

/**
 * Svelte action: typing @ in the field opens a list of notes (kind "note") or
 * tasks (kind "task"), with matching date words (@today, @tmrw, @monday, @now)
 * first. Arrow keys move, Enter or Tab picks, Escape closes.
 * Picking writes a link token into the field and fires an input event, so
 * bind:value and on:input handlers see it like normal typing.
 *
 *   <input use:mention={'note'} bind:value={text} />
 */
export interface MentionOptions {
  /** What this field links to: notes (task fields) or tasks (notes). */
  target: 'note' | 'task';
  /** Called for "pick a date…" entries, after the typed @word is removed. */
  onAction?: (action: 'pick-date' | 'pick-time') => void;
}

export function mention(node: Field, options: 'note' | 'task' | MentionOptions) {
  let opts: MentionOptions = typeof options === 'string' ? { target: options } : options;
  const kind = opts.target;
  let pop: HTMLDivElement | null = null;
  let items: Candidate[] = [];
  let sel = 0;
  let found: { start: number; query: string } | null = null;

  function close() {
    found = null;
    items = [];
    pop?.remove();
    pop = null;
  }

  function draw() {
    if (!pop) return;
    pop.replaceChildren(
      ...items.map((c, i) => {
        const row = document.createElement('div');
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', String(i === sel));
        row.style.cssText = `padding:4px 8px;cursor:pointer;display:flex;gap:8px;align-items:baseline;${
          i === sel ? 'background:color-mix(in srgb, var(--hl1) 16%, transparent);color:var(--hl1);' : 'color:var(--t2);'
        }`;
        const label = document.createElement('span');
        label.textContent = c.label;
        label.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;';
        row.append(label);
        if (c.detail) {
          const d = document.createElement('span');
          d.textContent = c.detail;
          d.style.cssText = 'margin-left:auto;font-size:11px;color:var(--t1);';
          row.append(d);
        }
        row.addEventListener('mousedown', (e) => {
          e.preventDefault(); // keep the field focused
          pick(i);
        });
        return row;
      }),
    );
  }

  function place() {
    if (!pop) return;
    const r = node.getBoundingClientRect();
    pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 300))}px`;
    pop.style.top = `${Math.min(r.bottom + 4, window.innerHeight - 40)}px`;
  }

  function refresh() {
    const m = findMention(node.value, node.selectionStart ?? node.value.length);
    if (!m) return close();
    const next = candidates(kind, m.query, { actions: !!opts.onAction });
    if (!next.length) return close();
    found = m;
    items = next;
    sel = Math.min(sel, items.length - 1);
    if (!pop) {
      pop = document.createElement('div');
      pop.setAttribute('role', 'listbox');
      pop.setAttribute('aria-label', kind === 'note' ? 'Notes' : 'Tasks');
      pop.style.cssText =
        'position:fixed;z-index:200;min-width:220px;max-width:320px;max-height:220px;overflow:auto;padding:4px 0;font:12px/1.4 ui-monospace,monospace;background:var(--bg1);border:1px solid var(--bg2);border-radius:6px;box-shadow:0 12px 30px -12px color-mix(in srgb, var(--bg2) 70%, transparent);';
      document.body.append(pop);
    }
    draw();
    place();
  }

  function pick(i: number) {
    const c = items[i];
    if (!c || !found) return;
    const caret = node.selectionStart ?? node.value.length;
    const next = applyMention(node.value, found.start, caret, c.insert);
    node.value = next.value;
    node.setSelectionRange(next.caret, next.caret);
    node.dispatchEvent(new Event('input', { bubbles: true }));
    close();
    node.focus();
    if (c.action) opts.onAction?.(c.action);
  }

  // Capture phase on the field itself, so the picker gets the keys before the
  // field's own handlers (Enter must not submit, Tab must not indent).
  function onKeydown(e: KeyboardEvent) {
    if (!pop || !items.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopImmediatePropagation();
      sel = (sel + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
      draw();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.stopImmediatePropagation();
      pick(sel);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    }
  }

  const onScroll = () => place();
  const onBlur = () => setTimeout(close, 120);
  node.addEventListener('keydown', onKeydown, true);
  node.addEventListener('input', refresh);
  node.addEventListener('click', refresh);
  node.addEventListener('keyup', (e: KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) refresh();
  });
  node.addEventListener('blur', onBlur);
  window.addEventListener('resize', onScroll);
  window.addEventListener('scroll', onScroll, true);

  return {
    update(next: 'note' | 'task' | MentionOptions) {
      opts = typeof next === 'string' ? { target: next } : next;
    },
    destroy() {
      node.removeEventListener('keydown', onKeydown, true);
      node.removeEventListener('input', refresh);
      node.removeEventListener('click', refresh);
      node.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
      close();
    },
  };
}
