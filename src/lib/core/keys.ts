/**
 * Every keyboard shortcut and gesture, for the shortcut sheet (Alt+/) and the
 * `keys` command. Keep this in step with the handlers: App.svelte for the
 * global Alt shortcuts, and each widget for its own keys.
 *
 * In `keys`, "Alt" and "Mod" are shown as ⌥ and ⌘ on macOS and as Alt and
 * Ctrl elsewhere.
 */

export interface Shortcut {
  /** Key combos, each a list of keys pressed together; alternatives are separate combos. */
  keys: string[][];
  does: string;
}

export interface ShortcutGroup {
  title: string;
  /** Where these keys work. */
  where?: string;
  items: Shortcut[];
}

export const SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Workspace',
    where: 'anywhere',
    items: [
      { keys: [['Alt', '/']], does: 'show this list of shortcuts' },
      { keys: [['Alt', '1…9']], does: 'focus pane 1 to 9' },
      { keys: [['Alt', '←↑↓→']], does: 'focus the pane in that direction' },
      { keys: [['Alt', 'Enter'], ['Alt', '\\']], does: 'split right with a terminal' },
      { keys: [['Alt', '-']], does: 'split down with a terminal' },
      { keys: [['Alt', 'W']], does: 'close the focused pane (its last pane closes the tab, never the last tab)' },
      { keys: [['Alt', 'M'], ['Alt', 'F']], does: 'maximize or restore the focused pane' },
      { keys: [['Alt', 'N']], does: 'new tab' },
      { keys: [['Alt', '['], ['Alt', ']']], does: 'previous / next tab' },
      { keys: [['Alt', 'T']], does: 'templates' },
      { keys: [['Alt', 'Y']], does: 'next theme (stays dark or light)' },
      { keys: [['Alt', 'Shift', 'Y']], does: 'random theme (stays dark or light)' },
      { keys: [['Alt', 'P']], does: 'play / pause the radio' },
      { keys: [['Alt', '.'], ['Alt', ',']], does: 'next / previous radio station' },
      { keys: [['Alt', 'S']], does: 'screensaver (any key returns)' },
    ],
  },
  {
    title: 'Terminal',
    items: [
      { keys: [['Tab']], does: 'complete the command or argument' },
      { keys: [['↑'], ['↓']], does: 'command history' },
      { keys: [['Ctrl', 'C']], does: 'stop the running command' },
      { keys: [['Ctrl', 'L']], does: 'clear the screen' },
      { keys: [['Ctrl', 'U']], does: 'clear the line' },
      { keys: [['&&']], does: 'chain commands: theme nord && clear' },
    ],
  },
  {
    title: 'Tasks',
    where: 'with a task row focused',
    items: [
      { keys: [['↑'], ['↓']], does: 'move between tasks (↓ from the input too)' },
      { keys: [['Space']], does: 'mark done / not done' },
      { keys: [['Enter']], does: 'rename' },
      { keys: [['Delete'], ['Backspace']], does: 'delete the task and its sub-tasks' },
      { keys: [['S']], does: 'add a sub-task' },
      { keys: [['N']], does: 'open the notes' },
      { keys: [['F']], does: 'focus on it: starts the pomodoro (again to stop and pause)' },
      { keys: [['M']], does: 'move it to another space' },
    ],
  },
  {
    title: 'Links, dates and reminders',
    where: 'in task fields and notes',
    items: [
      { keys: [['@']], does: 'link a note (from a task) or a task (from a note)' },
      { keys: [['@time'], ['@date']], does: 'insert [@time: …] (now) or [@date: …] (today)' },
      { keys: [['@tmrw'], ['@monday'], ['@today']], does: 'reminder date; in a task it sets the due date' },
      { keys: [['@pick']], does: 'in a note: pick a date (and time) from a calendar' },
      { keys: [['↑'], ['↓']], does: 'move in the @ list' },
      { keys: [['Enter'], ['Tab']], does: 'insert the highlighted item' },
      { keys: [['Esc']], does: 'close the @ list' },
    ],
  },
  {
    title: 'Notes',
    where: 'live preview: the line you are on shows its markdown',
    items: [
      { keys: [['click']], does: 'a line to edit its markdown; a link or chip to open it' },
      { keys: [['hover'], ['right-click']], does: 'a [@task:] or [@date:] chip: details and actions' },
      { keys: [['Shift', 'F10']], does: 'the same card for a focused chip (reading view)' },
      { keys: [['select']], does: 'text to get a toolbar: bullet / numbered / check list, accordion' },
      { keys: [['Mod', 'Shift', '8'], ['Mod', 'Shift', '7'], ['Mod', 'Shift', '9']], does: 'bullet / numbered / check list (again to undo)' },
      { keys: [['Mod', 'B'], ['Mod', 'I']], does: 'bold / italic' },
      { keys: [['Mod', 'Z'], ['Mod', 'Shift', 'Z']], does: 'undo / redo' },
      { keys: [['Mod', 'S']], does: 'save now' },
      { keys: [['Tab']], does: 'indent' },
      { keys: [['Enter']], does: 'continue a list or quote' },
    ],
  },
  {
    title: 'Calendar',
    where: 'with the calendar focused',
    items: [
      { keys: [['pinch'], ['Ctrl', 'scroll']], does: 'zoom between year, month, week and day' },
      { keys: [['+'], ['-']], does: 'zoom in / out' },
      { keys: [['Y'], ['M'], ['W'], ['D']], does: 'year, month, week or day view' },
      { keys: [['←'], ['→'], ['swipe']], does: 'previous / next page' },
      { keys: [['T']], does: 'today' },
    ],
  },
  {
    title: 'Clock',
    where: 'with the clock focused',
    items: [
      { keys: [['A']], does: 'digital / analog' },
      { keys: [['H']], does: '12h / 24h (digital)' },
    ],
  },
  {
    title: 'Spotify',
    where: 'with the player focused',
    items: [
      { keys: [['/']], does: 'jump to the link box' },
      { keys: [['P']], does: 'presets and recent' },
    ],
  },
  {
    title: 'Games',
    items: [
      { keys: [['WASD'], ['arrows']], does: 'move' },
      { keys: [['Space']], does: 'pause / resume' },
    ],
  },
];

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

/** "Alt" → "⌥" and "Mod" → "⌘" on macOS; "Mod" → "Ctrl" elsewhere. */
export function keyLabel(key: string): string {
  if (key === 'Alt') return isMac ? '⌥' : 'Alt';
  if (key === 'Mod') return isMac ? '⌘' : 'Ctrl';
  if (key === 'Shift') return isMac ? '⇧' : 'Shift';
  return key;
}

/** One combo as text: "⌥ Shift Y" / "Alt+Shift+Y". */
export function comboText(combo: string[]): string {
  return combo.map(keyLabel).join(isMac ? ' ' : '+');
}
