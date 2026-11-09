/**
 * Text transforms for the notes selection toolbar: turn lines into a bullet,
 * numbered or check list (or back to plain lines), and wrap lines in an
 * accordion (<details>). Pure functions of text, so they are easy to test.
 */

export type ListKind = 'bullet' | 'number' | 'check';

const LIST_PREFIX = /^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/;
const IS = {
  bullet: /^\s*[-*+]\s+(?!\[[ xX]\])/,
  number: /^\s*\d+[.)]\s+/,
  check: /^\s*[-*+]\s+\[[ xX]\]\s+/,
} as const;

/** The line without its list marker (and checkbox), keeping its indentation. */
export function stripList(line: string): string {
  return line.replace(LIST_PREFIX, '$1');
}

/**
 * Make `lines` a list of `kind`. Blank lines stay blank; indentation is kept,
 * and numbering restarts for each indentation level. If every line already is
 * that kind of list, the markers come off instead (a toggle).
 */
export function toList(lines: string[], kind: ListKind): string[] {
  const filled = lines.filter((l) => l.trim());
  if (filled.length && filled.every((l) => IS[kind].test(l))) return lines.map(stripList);
  const counters = new Map<number, number>();
  return lines.map((line) => {
    if (!line.trim()) return line;
    const plain = stripList(line);
    const indent = /^\s*/.exec(plain)![0];
    const text = plain.slice(indent.length);
    // a checked box survives a switch between check lists only
    const checked = kind === 'check' && /^\s*[-*+]\s+\[[xX]\]/.test(line);
    if (kind === 'bullet') return `${indent}- ${text}`;
    if (kind === 'check') return `${indent}- [${checked ? 'x' : ' '}] ${text}`;
    // numbering: count per indent level, and reset deeper levels
    for (const level of [...counters.keys()]) if (level > indent.length) counters.delete(level);
    const n = (counters.get(indent.length) ?? 0) + 1;
    counters.set(indent.length, n);
    return `${indent}${n}. ${text}`;
  });
}

/** A heading or list marker off a line, for the accordion title. */
const titleOf = (line: string) => stripList(line).replace(/^\s*#{1,6}\s+/, '').trim();

/**
 * Wrap lines in an accordion. The first line is the title and the rest the
 * hidden content; a single line becomes the title with an empty body. Also
 * returns where the body starts, so the caret can go there.
 */
export function toAccordion(lines: string[]): { text: string; bodyOffset: number } {
  const first = lines.findIndex((l) => l.trim());
  const title = first >= 0 ? titleOf(lines[first]).replace(/<\/?summary>/gi, '') || 'Details' : 'Details';
  const body = first >= 0 ? lines.slice(first + 1) : [];
  while (body.length && !body[0].trim()) body.shift();
  while (body.length && !body[body.length - 1].trim()) body.pop();
  const head = `<details>\n<summary>${title}</summary>\n\n`;
  return { text: `${head}${body.join('\n')}\n\n</details>`, bodyOffset: head.length };
}

/** An accordion's summary line: `<summary>Title</summary>`. */
export const SUMMARY_LINE = /^\s*<summary>(.*)<\/summary>\s*$/i;
export const DETAILS_OPEN = /^\s*<details(\s+open)?\s*>\s*$/i;
export const DETAILS_CLOSE = /^\s*<\/details>\s*$/i;
