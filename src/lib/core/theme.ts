import { get, writable } from 'svelte/store';
import { load, save } from './storage';

/**
 * Every theme is five colours, exposed as CSS variables:
 *   --bg1  page / pane background
 *   --bg2  secondary surface, borders, cursor
 *   --hl1  accent / highlight
 *   --t1   muted text
 *   --t2   main text
 * Use these variables (or the windi colours bg1, bg2, hl1, t1, t2) for every
 * colour so all features follow the active theme.
 */
export const themes = {
  'default-dark': ['#000000', '#3a3a3a', '#EF4444', '#A0A0A0', '#FFFFFF'],
  'default-light': ['#FFFFFF', '#d4d4d4', '#EF4444', '#696969', '#000000'],
  'tokyo-night': ['#1a1b26', '#2f3549', '#7aa2f7', '#787c99', '#c0caf5'],
  'catppuccin-mocha': ['#1e1e2e', '#45475a', '#cba6f7', '#a6adc8', '#cdd6f4'],
  nord: ['#2e3440', '#4c566a', '#88c0d0', '#a3acb9', '#eceff4'],
  'atom-dark': ['#1b1f23', '#3a404b', '#e06c75', '#abb2bf', '#e6e6e6'],
  'atom-light': ['#fafafa', '#e1e1e1', '#e45649', '#696c77', '#383a42'],
  'dracula-dark': ['#282a36', '#44475a', '#ff79c6', '#a8b0d3', '#f8f8f2'],
  'gruvbox-dark': ['#282828', '#504945', '#fe8019', '#a89984', '#ebdbb2'],
  'gruvbox-light': ['#fbf1c7', '#d5c4a1', '#af3a03', '#7c6f64', '#3c3836'],
  'material-dark': ['#212121', '#424242', '#ff4081', '#b0bec5', '#ffffff'],
  'monokai-dark': ['#272822', '#49483e', '#f92672', '#a59f85', '#f8f8f2'],
  'solarized-dark': ['#002b36', '#0d4654', '#b58900', '#839496', '#eee8d5'],
  'solarized-light': ['#fdf6e3', '#e4ddc8', '#cb4b16', '#657b83', '#073642'],
  matrix: ['#000800', '#0b3d0b', '#00ff41', '#2e8b57', '#b6ffb6'],
  synthwave: ['#1a1033', '#3b2a5c', '#ff7edb', '#9a8cc2', '#f4eeff'],
} as const;

export type ThemeName = keyof typeof themes;
export const themeNames = Object.keys(themes) as ThemeName[];

const KEY = 'theme';

function initial(): ThemeName {
  const stored = load<string>(KEY, '');
  if (stored in themes) return stored as ThemeName;
  // migrate the old key used before the rewrite: "theme <name>"
  try {
    const legacy = localStorage.getItem('curr-theme');
    const name = legacy?.split(' ')[1];
    if (name && name in themes) return name as ThemeName;
  } catch {
    /* ignore */
  }
  return 'default-dark';
}

export const themeStore = writable<ThemeName>(initial());

export function applyTheme(name: ThemeName) {
  const [bg1, bg2, hl1, t1, t2] = themes[name];
  const s = document.documentElement.style;
  s.setProperty('--bg1', bg1);
  s.setProperty('--bg2', bg2);
  s.setProperty('--hl1', hl1);
  s.setProperty('--t1', t1);
  s.setProperty('--t2', t2);
  document.documentElement.style.colorScheme = isLight(bg1) ? 'light' : 'dark';
}

function isLight(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return r * 0.299 + g * 0.587 + b * 0.114 > 150;
}

themeStore.subscribe((name) => {
  applyTheme(name);
  save(KEY, name);
});

export function setTheme(name: string): boolean {
  if (!(name in themes)) return false;
  themeStore.set(name as ThemeName);
  return true;
}

/**
 * Move to the next theme, or a random one (never the current one).
 * Alt+Y uses next, Alt+Shift+Y random.
 */
export function cycleTheme(random = false): ThemeName {
  const current = get(themeStore);
  let name: ThemeName;
  if (random) {
    const others = themeNames.filter((n) => n !== current);
    name = others[Math.floor(Math.random() * others.length)];
  } else {
    name = themeNames[(themeNames.indexOf(current) + 1) % themeNames.length];
  }
  themeStore.set(name);
  return name;
}
