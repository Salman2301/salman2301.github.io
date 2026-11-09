import { get, writable } from 'svelte/store';
import { applyFavicon } from './favicon';
import { load, persisted } from './storage';

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
  // Popular VS Code themes, from their published palettes.
  'one-dark-pro': ['#282c34', '#3e4451', '#61afef', '#7f848e', '#abb2bf'],
  'github-dark': ['#0d1117', '#30363d', '#58a6ff', '#8b949e', '#c9d1d9'],
  'github-light': ['#ffffff', '#d0d7de', '#0969da', '#57606a', '#24292f'],
  'night-owl': ['#011627', '#1d3b53', '#c792ea', '#5f7e97', '#d6deeb'],
  'monokai-pro': ['#2d2a2e', '#403e41', '#ffd866', '#939293', '#fcfcfa'],
  'ayu-dark': ['#0b0e14', '#273747', '#e6b450', '#6c7380', '#bfbdb6'],
  'ayu-light': ['#fcfcfc', '#e1e3e6', '#fa8d3e', '#8a9199', '#5c6166'],
  palenight: ['#292d3e', '#444267', '#c792ea', '#8796b0', '#bfc7d5'],
  cobalt2: ['#193549', '#1f4662', '#ffc600', '#9eb7cc', '#ffffff'],
  'shades-of-purple': ['#2d2b55', '#4d4a8a', '#fad000', '#a599e9', '#ffffff'],
} as const;

export type ThemeName = keyof typeof themes;
export const themeNames = Object.keys(themes) as ThemeName[];
export const isThemeName = (v: unknown): v is ThemeName => typeof v === 'string' && v in themes;

function isLight(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return r * 0.299 + g * 0.587 + b * 0.114 > 150;
}

/** Light or dark, from the theme's background. */
export const kindOf = (name: ThemeName): 'light' | 'dark' => (isLight(themes[name][0]) ? 'light' : 'dark');
export const darkThemes = themeNames.filter((n) => kindOf(n) === 'dark');
export const lightThemes = themeNames.filter((n) => kindOf(n) === 'light');

/* ------------------------------------------------------- mode and picks */

/**
 * The mode says which of two remembered themes is shown: "system" follows
 * the OS light / dark setting, "dark" and "light" force one. Picking a theme
 * makes it the dark or the light pick, by its background.
 */
export type ThemeMode = 'system' | 'dark' | 'light';
export const THEME_MODES: ThemeMode[] = ['system', 'dark', 'light'];

const isName = (v: unknown): v is ThemeName => typeof v === 'string' && v in themes;

// Before modes there was one saved theme (and before that "curr-theme").
function legacyTheme(): ThemeName | null {
  const stored = load<string>('theme', '');
  if (isName(stored)) return stored;
  try {
    const name = localStorage.getItem('curr-theme')?.split(' ')[1];
    if (isName(name)) return name;
  } catch {
    /* ignore */
  }
  return null;
}

const legacy = legacyTheme();
export const themeMode = persisted<ThemeMode>('theme:mode', legacy ? kindOf(legacy) : 'system');
export const darkTheme = persisted<ThemeName>('theme:dark', legacy && kindOf(legacy) === 'dark' ? legacy : 'default-dark');
export const lightTheme = persisted<ThemeName>('theme:light', legacy && kindOf(legacy) === 'light' ? legacy : 'default-light');

const osDark = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)') : null;
const systemKind = (): 'dark' | 'light' => (osDark && !osDark.matches ? 'light' : 'dark');

/**
 * A theme that wins over the mode and picks while set: the active space's own
 * theme. Null shows the normal theme.
 */
export const themeOverride = writable<ThemeName | null>(null);

function effective(): ThemeName {
  const forced = get(themeOverride);
  if (isName(forced)) return forced;
  const mode = get(themeMode);
  const kind = mode === 'system' ? systemKind() : mode;
  const pick = kind === 'dark' ? get(darkTheme) : get(lightTheme);
  if (isName(pick) && kindOf(pick) === kind) return pick;
  return kind === 'dark' ? 'default-dark' : 'default-light';
}

/** The theme on screen. Read it anywhere; change it with setTheme or setThemeMode. */
export const themeStore = writable<ThemeName>(effective());

function refresh() {
  const next = effective();
  if (get(themeStore) !== next) themeStore.set(next);
}

themeMode.subscribe(refresh);
themeOverride.subscribe(refresh);
darkTheme.subscribe(refresh);
lightTheme.subscribe(refresh);
osDark?.addEventListener('change', refresh);

export function applyTheme(name: ThemeName) {
  const [bg1, bg2, hl1, t1, t2] = themes[name];
  const s = document.documentElement.style;
  s.setProperty('--bg1', bg1);
  s.setProperty('--bg2', bg2);
  s.setProperty('--hl1', hl1);
  s.setProperty('--t1', t1);
  s.setProperty('--t2', t2);
  document.documentElement.style.colorScheme = isLight(bg1) ? 'light' : 'dark';
  applyFavicon(bg1, hl1);
}

themeStore.subscribe(applyTheme);

/**
 * Show a theme: it becomes the dark or the light pick. "system" mode stays
 * on when the OS is already showing that kind; otherwise the mode switches
 * to the theme's kind so it is visible.
 */
export function setTheme(name: string): boolean {
  if (!isName(name)) return false;
  // Picking a theme by hand shows it, even inside a space with its own theme.
  themeOverride.set(null);
  const kind = kindOf(name);
  (kind === 'dark' ? darkTheme : lightTheme).set(name);
  if (!(get(themeMode) === 'system' && systemKind() === kind)) themeMode.set(kind);
  return true;
}

export function setThemeMode(mode: ThemeMode) {
  themeOverride.set(null);
  themeMode.set(mode);
}

/** system → dark → light → system. Returns the new mode. */
export function cycleThemeMode(): ThemeMode {
  themeOverride.set(null);
  const next = THEME_MODES[(THEME_MODES.indexOf(get(themeMode)) + 1) % THEME_MODES.length];
  themeMode.set(next);
  return next;
}

/**
 * Move to the next theme of the same kind (dark or light), or a random one
 * of that kind (never the current one). Alt+Y uses next, Alt+Shift+Y random.
 */
export function cycleTheme(random = false): ThemeName {
  const current = get(themeStore);
  const pool = kindOf(current) === 'dark' ? darkThemes : lightThemes;
  let name: ThemeName;
  if (random) {
    const others = pool.filter((n) => n !== current);
    name = others[Math.floor(Math.random() * others.length)] ?? current;
  } else {
    name = pool[(pool.indexOf(current) + 1) % pool.length];
  }
  setTheme(name);
  return name;
}
