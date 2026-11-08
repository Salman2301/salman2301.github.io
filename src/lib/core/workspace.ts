import { derived, get, writable } from 'svelte/store';
import type { Config } from './types';
import { load, save } from './storage';

/* ------------------------------------------------------------------- model */

export type Direction = 'row' | 'column';

export interface PaneLeaf {
  id: string;
  type: 'pane';
  widget: string;
  config: Config;
}

export interface PaneSplit {
  id: string;
  type: 'split';
  direction: Direction;
  children: PaneNode[];
  /** Fractions that sum to 1, one per child. */
  sizes: number[];
}

export type PaneNode = PaneLeaf | PaneSplit;

export interface WorkspaceState {
  root: PaneNode;
  /** Id of the template the layout came from (null once edited by hand is fine). */
  template: string | null;
  focused: string | null;
  maximized: string | null;
}

let counter = 0;
export function uid(prefix = 'p'): string {
  counter += 1;
  return `${prefix}${Math.random().toString(36).slice(2, 7)}${counter.toString(36)}`;
}

/* ---------------------------------------------------------- tree builders */

export function leaf(widget: string, config: Config = {}): PaneLeaf {
  return { id: uid('p'), type: 'pane', widget, config: { ...config } };
}

export function split(direction: Direction, children: PaneNode[], sizes?: number[]): PaneSplit {
  return { id: uid('s'), type: 'split', direction, children, sizes: normalizeSizes(sizes, children.length) };
}
export const row = (children: PaneNode[], sizes?: number[]) => split('row', children, sizes);
export const col = (children: PaneNode[], sizes?: number[]) => split('column', children, sizes);

function normalizeSizes(sizes: number[] | undefined, n: number): number[] {
  if (!sizes || sizes.length !== n || sizes.some((s) => !(s > 0))) return Array(n).fill(1 / n);
  const total = sizes.reduce((a, b) => a + b, 0);
  return sizes.map((s) => s / total);
}

/** Give every node a fresh id (used when instantiating templates). */
export function cloneTree(node: PaneNode): PaneNode {
  if (node.type === 'pane') return { ...node, id: uid('p'), config: JSON.parse(JSON.stringify(node.config ?? {})) };
  return { ...node, id: uid('s'), children: node.children.map(cloneTree), sizes: [...node.sizes] };
}

/** Collapse single-child splits and fix sizes. Returns a new tree. */
export function normalize(node: PaneNode): PaneNode {
  if (node.type === 'pane') return node;
  const children = node.children.map(normalize);
  if (children.length === 1) return children[0];
  return { ...node, children, sizes: normalizeSizes(node.sizes, children.length) };
}

export function leaves(node: PaneNode): PaneLeaf[] {
  return node.type === 'pane' ? [node] : node.children.flatMap(leaves);
}

export function findLeaf(node: PaneNode, id: string): PaneLeaf | undefined {
  return leaves(node).find((l) => l.id === id);
}

function mapTree(node: PaneNode, fn: (n: PaneNode) => PaneNode | null): PaneNode | null {
  const mapped = fn(node);
  if (mapped !== node || mapped === null || mapped.type === 'pane') return mapped;
  const kept: { child: PaneNode; size: number }[] = [];
  mapped.children.forEach((c, i) => {
    const child = mapTree(c, fn);
    if (child) kept.push({ child, size: mapped.sizes[i] ?? 1 / mapped.children.length });
  });
  if (kept.length === 0) return null;
  return {
    ...mapped,
    children: kept.map((k) => k.child),
    sizes: normalizeSizes(
      kept.map((k) => k.size),
      kept.length,
    ),
  };
}

function isValidTree(node: unknown): node is PaneNode {
  if (!node || typeof node !== 'object') return false;
  const n = node as PaneNode;
  if (n.type === 'pane') return typeof n.id === 'string' && typeof n.widget === 'string';
  if (n.type === 'split')
    return (
      (n.direction === 'row' || n.direction === 'column') &&
      Array.isArray(n.children) &&
      n.children.length > 0 &&
      n.children.every(isValidTree)
    );
  return false;
}

/* ------------------------------------------------------------------- store */

const STORAGE_KEY = 'workspace:v1';

function defaultState(): WorkspaceState {
  const root = leaf('terminal', { startup: ['whoami', 'motd'] });
  return { root, template: 'classic', focused: root.id, maximized: null };
}

function initialState(): WorkspaceState {
  const fromHash = readShareHash();
  if (fromHash) return fromHash;
  const stored = load<WorkspaceState | null>(STORAGE_KEY, null);
  if (stored && isValidTree(stored.root)) {
    const root = normalize(stored.root);
    for (const l of leaves(root)) l.config = l.config ?? {};
    const focused = stored.focused && findLeaf(root, stored.focused) ? stored.focused : leaves(root)[0].id;
    return { root, template: stored.template ?? null, focused, maximized: null };
  }
  return defaultState();
}

export const workspace = writable<WorkspaceState>(initialState());

let saveTimer: ReturnType<typeof setTimeout> | undefined;
workspace.subscribe((state) => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save(STORAGE_KEY, state), 200);
});

export const focusedPaneId = derived(workspace, (s) => s.focused);
export const paneCount = derived(workspace, (s) => leaves(s.root).length);

function commit(fn: (s: WorkspaceState) => WorkspaceState) {
  workspace.update((s) => {
    const next = fn(s);
    const root = normalize(next.root);
    const ids = leaves(root).map((l) => l.id);
    const focused = next.focused && ids.includes(next.focused) ? next.focused : ids[0] ?? null;
    const maximized = next.maximized && ids.includes(next.maximized) ? next.maximized : null;
    return { ...next, root, focused, maximized };
  });
}

/* --------------------------------------------------------------- mutations */

export function focusPane(id: string) {
  if (get(workspace).focused === id) return;
  commit((s) => ({ ...s, focused: id }));
}

export function toggleMaximize(id?: string) {
  commit((s) => {
    const target = id ?? s.focused;
    return { ...s, maximized: s.maximized ? null : target, focused: target ?? s.focused };
  });
}

/**
 * Split pane `targetId` and put `newLeaf` next to it. When the parent already
 * splits in the same direction, the new pane becomes a sibling instead of
 * nesting a new split.
 */
export function splitPane(
  targetId: string,
  direction: Direction,
  newLeaf: PaneLeaf = leaf('terminal'),
  position: 'before' | 'after' = 'after',
): string {
  commit((s) => {
    const insert = (node: PaneNode): PaneNode => {
      if (node.type === 'pane') {
        if (node.id !== targetId) return node;
        const kids = position === 'after' ? [node, newLeaf] : [newLeaf, node];
        return split(direction, kids);
      }
      const idx = node.children.findIndex((c) => c.id === targetId);
      if (idx >= 0 && node.direction === direction) {
        const children = [...node.children];
        const sizes = [...node.sizes];
        const half = sizes[idx] / 2;
        const at = position === 'after' ? idx + 1 : idx;
        children.splice(at, 0, newLeaf);
        sizes.splice(idx, 1, half);
        sizes.splice(at, 0, half);
        return { ...node, children, sizes };
      }
      return { ...node, children: node.children.map(insert) };
    };
    return { ...s, root: insert(s.root), focused: newLeaf.id, maximized: null, template: s.template };
  });
  return newLeaf.id;
}

/** Close a pane. Closing the last pane leaves a fresh terminal. */
export function closePane(id: string) {
  commit((s) => {
    const all = leaves(s.root);
    if (all.length <= 1) {
      const fresh = leaf('terminal', { startup: ['motd'] });
      return { ...s, root: fresh, focused: fresh.id, maximized: null };
    }
    const idx = all.findIndex((l) => l.id === id);
    const neighbour = all[idx + 1] ?? all[idx - 1];
    const root = mapTree(s.root, (n) => (n.type === 'pane' && n.id === id ? null : n)) ?? leaf('terminal');
    return { ...s, root, focused: s.focused === id ? neighbour?.id ?? null : s.focused };
  });
}

export function replaceWidget(id: string, widget: string, config: Config = {}) {
  commit((s) => ({
    ...s,
    root: mapTree(s.root, (n) => (n.type === 'pane' && n.id === id ? { ...n, widget, config: { ...config } } : n))!,
    focused: id,
  }));
}

export function updatePaneConfig(id: string, patch: Config) {
  workspace.update((s) => ({
    ...s,
    root: mapTree(s.root, (n) =>
      n.type === 'pane' && n.id === id ? { ...n, config: { ...n.config, ...patch } } : n,
    )!,
  }));
}

export function setSizes(splitId: string, sizes: number[]) {
  workspace.update((s) => ({
    ...s,
    root: mapTree(s.root, (n) => (n.type === 'split' && n.id === splitId ? { ...n, sizes } : n))!,
  }));
}

/** Replace the whole layout (used by templates). */
export function setLayout(root: PaneNode, template: string | null) {
  const fresh = cloneTree(root);
  commit(() => ({ root: fresh, template, focused: leaves(fresh)[0].id, maximized: null }));
}

/** Swap the positions of two panes. */
export function swapPanes(a: string, b: string) {
  commit((s) => {
    const la = findLeaf(s.root, a);
    const lb = findLeaf(s.root, b);
    if (!la || !lb) return s;
    const root = mapTree(s.root, (n) => {
      if (n.type !== 'pane') return n;
      if (n.id === a) return { ...lb };
      if (n.id === b) return { ...la };
      return n;
    })!;
    return { ...s, root };
  });
}

/* ------------------------------------------------------------ openWidget */

export interface OpenOptions {
  /** Focus an existing pane with this widget instead of opening a new one. Default true. */
  reuse?: boolean;
  /** Pane to split next to. Defaults to the focused pane. */
  from?: string;
  direction?: Direction;
  /** Replace `from` instead of splitting it. */
  replace?: boolean;
}

/**
 * Open a widget. Reuses an existing pane of the same widget by default,
 * otherwise splits the pane `from` (or the focused pane) along its longer
 * side. Returns the pane id.
 */
export function openWidget(widget: string, config?: Config, opts: OpenOptions = {}): string {
  const s = get(workspace);
  const { reuse = true } = opts;
  if (reuse) {
    const existing = leaves(s.root).find((l) => l.widget === widget);
    if (existing) {
      if (config) updatePaneConfig(existing.id, config);
      commit((st) => ({ ...st, focused: existing.id, maximized: st.maximized ? existing.id : null }));
      return existing.id;
    }
  }
  const from = opts.from ?? s.focused ?? leaves(s.root)[0].id;
  if (opts.replace) {
    replaceWidget(from, widget, config ?? {});
    return from;
  }
  const direction = opts.direction ?? guessDirection(from);
  return splitPane(from, direction, leaf(widget, config ?? {}));
}

function guessDirection(paneId: string): Direction {
  try {
    const el = document.querySelector(`[data-pane-id="${paneId}"]`) as HTMLElement | null;
    if (el) {
      const r = el.getBoundingClientRect();
      return r.width >= r.height * 1.1 ? 'row' : 'column';
    }
  } catch {
    /* ignore */
  }
  return 'row';
}

/** Move focus to the closest pane in a direction, using on-screen geometry. */
export function focusNeighbour(dir: 'left' | 'right' | 'up' | 'down') {
  const s = get(workspace);
  if (!s.focused) return;
  const rectOf = (id: string) =>
    (document.querySelector(`[data-pane-id="${id}"]`) as HTMLElement | null)?.getBoundingClientRect();
  const from = rectOf(s.focused);
  if (!from) return;
  const cx = from.left + from.width / 2;
  const cy = from.top + from.height / 2;
  let best: { id: string; d: number } | null = null;
  for (const l of leaves(s.root)) {
    if (l.id === s.focused) continue;
    const r = rectOf(l.id);
    if (!r) continue;
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const ok =
      (dir === 'left' && r.right <= from.left + 2) ||
      (dir === 'right' && r.left >= from.right - 2) ||
      (dir === 'up' && r.bottom <= from.top + 2) ||
      (dir === 'down' && r.top >= from.bottom - 2);
    if (!ok) continue;
    const d = Math.hypot(x - cx, y - cy);
    if (!best || d < best.d) best = { id: l.id, d };
  }
  if (best) focusPane(best.id);
}

/* ------------------------------------------------------------- share links */

function encode(obj: unknown): string {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decode<T>(str: string): T | null {
  try {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

/** A URL that recreates the current layout (widget configs included). */
export function shareUrl(): string {
  const s = get(workspace);
  const strip = (n: PaneNode): unknown =>
    n.type === 'pane'
      ? { t: 'p', w: n.widget, c: n.config }
      : { t: 's', d: n.direction === 'row' ? 'r' : 'c', z: n.sizes.map((x) => +x.toFixed(3)), k: n.children.map(strip) };
  return `${location.origin}${location.pathname}#ws=${encode({ r: strip(s.root), t: s.template })}`;
}

function readShareHash(): WorkspaceState | null {
  try {
    const m = location.hash.match(/#ws=([A-Za-z0-9_-]+)/);
    if (!m) return null;
    type Packed = { t: 'p'; w: string; c?: Config } | { t: 's'; d: 'r' | 'c'; z?: number[]; k: Packed[] };
    const data = decode<{ r: Packed; t?: string | null }>(m[1]);
    if (!data) return null;
    const unpack = (p: Packed): PaneNode =>
      p.t === 'p' ? leaf(String(p.w), p.c ?? {}) : split(p.d === 'r' ? 'row' : 'column', p.k.map(unpack), p.z);
    const root = normalize(unpack(data.r));
    if (!isValidTree(root)) return null;
    history.replaceState(null, '', location.pathname + location.search);
    return { root, template: data.t ?? null, focused: leaves(root)[0].id, maximized: null };
  } catch {
    return null;
  }
}
