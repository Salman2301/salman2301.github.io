import DOMPurify from 'dompurify';
import { marked } from 'marked';

marked.setOptions({ gfm: true, breaks: true });

// Links open in a new tab; task-list checkboxes become clickable.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
  if (node.tagName === 'INPUT' && node.getAttribute('type') === 'checkbox') {
    node.removeAttribute('disabled');
  }
});

/** Markdown to sanitized HTML. */
export function renderMarkdown(src: string): string {
  const html = DOMPurify.sanitize(marked.parse(src, { async: false }) as string);
  return html.replace(/<li>(\s*)<input/g, '<li class="task">$1<input');
}

/** Toggle the n-th task checkbox ("- [ ]" / "- [x]") in the markdown source. */
export function toggleTask(src: string, index: number): string {
  let i = -1;
  return src.replace(/^(\s*(?:[-*+]|\d+\.)\s+)\[( |x|X)\]/gm, (match, prefix: string, mark: string) => {
    i += 1;
    if (i !== index) return match;
    return `${prefix}[${mark === ' ' ? 'x' : ' '}]`;
  });
}
