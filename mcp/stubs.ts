/**
 * Browser-only pieces the data modules import, replaced when bundling for
 * Node: toasts and sounds (notify), pane layout (workspace).
 */
export function notify() {
  /* no toasts in a terminal */
}
export function openWidget(): string {
  return '';
}
export const calendarRequest = { set() {}, update() {}, subscribe: () => () => undefined };
