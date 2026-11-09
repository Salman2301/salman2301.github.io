import { get } from 'svelte/store';
import type { CommandDef } from '../core/types';
import { commands, games, widgets } from '../core/registry';
import { themeStore } from '../core/theme';
import { leaves, workspace } from '../core/workspace';
import { sleep } from '../terminal/parse';
import Neofetch, { type InfoRow } from '../widgets/matrix/output/Neofetch.svelte';

/** neofetch for the browser: the visitor's system next to the S2301 mark. */

const USER = 'salman';
const HOST = 'salman2301.github.io';

// The owner's details, as in whoami (terminal/output/Whoami.svelte).
const OWNER: InfoRow[] = [
  { label: 'Author', value: 'Salman, full stack developer at Monto' },
  {
    label: 'Links',
    value: 'https://github.com/salman2301 · https://salman2301.com',
    links: [
      { text: 'github', href: 'https://github.com/salman2301' },
      { text: 'twitter', href: 'https://twitter.com/salman2301' },
      { text: 'linkedin', href: 'https://www.linkedin.com/in/asalman2301/' },
      { text: 'salman2301.com', href: 'https://salman2301.com' },
    ],
  },
];

/* ------------------------------------------------------------ the browser */

interface ClientHints {
  platform?: string;
  platformVersion?: string;
  architecture?: string;
  bitness?: string;
  model?: string;
  fullVersionList?: { brand: string; version: string }[];
}

type NavigatorExtras = Navigator & {
  userAgentData?: { getHighEntropyValues?(hints: string[]): Promise<ClientHints> };
  deviceMemory?: number;
};

export interface SystemInfo {
  os: string;
  browser: string;
  arch?: string;
  model?: string;
}

const WINDOWS: Record<string, string> = { '10.0': 'Windows 10/11', '6.3': 'Windows 8.1', '6.2': 'Windows 8', '6.1': 'Windows 7' };

// Order matters: Edge and Opera also say "Chrome", Chrome also says "Safari".
const BROWSERS: [RegExp, string][] = [
  [/Edg(?:e|A|iOS)?\/([\d.]+)/, 'Edge'],
  [/OPR\/([\d.]+)/, 'Opera'],
  [/SamsungBrowser\/([\d.]+)/, 'Samsung Internet'],
  [/(?:Firefox|FxiOS)\/([\d.]+)/, 'Firefox'],
  [/CriOS\/([\d.]+)/, 'Chrome'],
  [/Chrome\/([\d.]+)/, 'Chrome'],
  [/Version\/([\d.]+).*Safari/, 'Safari'],
];

/** "131.0.6778.86" -> "131", "17.1" -> "17.1" */
const shortVersion = (v: string) => v.split('.').slice(0, 2).join('.').replace(/\.0$/, '');

function osFromUserAgent(ua: string, touchPoints: number): string {
  let m: RegExpMatchArray | null;
  if ((m = ua.match(/(?:iPhone|iPad|iPod).*? OS (\d+)[._](\d+)/))) return `iOS ${m[1]}.${m[2]}`;
  if (/Macintosh/.test(ua) && touchPoints > 1) return 'iPadOS'; // iPads ask for the desktop site
  if ((m = ua.match(/Android (\d+(?:\.\d+)?)/))) return `Android ${m[1]}`;
  if ((m = ua.match(/Windows NT (\d+\.\d+)/))) return WINDOWS[m[1]] ?? `Windows NT ${m[1]}`;
  if (/CrOS/.test(ua)) return 'ChromeOS';
  // Browsers froze this at 10.15 years ago, so only older versions are worth showing.
  if ((m = ua.match(/Mac OS X (\d+)[._](\d+)/))) return m[1] === '10' && +m[2] >= 15 ? 'macOS' : `macOS ${m[1]}.${m[2]}`;
  if (/Linux/.test(ua)) return 'Linux';
  return 'an unknown OS';
}

export function parseUserAgent(ua: string, touchPoints = 0): SystemInfo {
  const hit = BROWSERS.map(([re, name]) => [ua.match(re), name] as const).find(([m]) => m);
  return {
    os: osFromUserAgent(ua, touchPoints),
    browser: hit ? `${hit[1]} ${shortVersion(hit[0]![1])}` : 'a mystery browser',
  };
}

/** Client hints know what the frozen user agent string hides (real macOS and Windows versions, CPU). */
function refine(info: SystemInfo, hints: ClientHints): SystemInfo {
  const next = { ...info };
  const version = hints.platformVersion ?? '';
  const major = parseInt(version, 10);
  if (hints.platform === 'macOS' && version) next.os = `macOS ${shortVersion(version)}`;
  else if (hints.platform === 'Windows' && major) next.os = major >= 13 ? 'Windows 11' : 'Windows 10';
  else if (hints.platform === 'Android' && version) next.os = `Android ${shortVersion(version)}`;
  if (hints.architecture) next.arch = hints.architecture === 'arm' ? (hints.bitness === '64' ? 'arm64' : 'arm') : hints.bitness === '64' ? 'x86_64' : 'x86';
  if (hints.model) next.model = hints.model;
  const brands = (hints.fullVersionList ?? []).filter((b) => !/not.?a.?brand/i.test(b.brand));
  const brand = brands.find((b) => b.brand !== 'Chromium') ?? brands[0];
  if (brand) next.browser = `${brand.brand.replace(/^(Google|Microsoft) /, '')} ${shortVersion(brand.version)}`;
  return next;
}

async function detectSystem(signal: AbortSignal): Promise<SystemInfo> {
  const nav = navigator as NavigatorExtras;
  const info = parseUserAgent(nav.userAgent, nav.maxTouchPoints || 0);
  const ask = nav.userAgentData?.getHighEntropyValues;
  if (!ask) return info;
  try {
    const hints = await Promise.race([
      ask.call(nav.userAgentData, ['platformVersion', 'architecture', 'bitness', 'model', 'fullVersionList']),
      sleep(400, signal).then(() => null),
    ]);
    return hints ? refine(info, hints) : info;
  } catch {
    return info;
  }
}

/* ------------------------------------------------------------ formatting */

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

export function formatUptime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const parts: string[] = [];
  if (days) parts.push(plural(days, 'day'));
  if (hours) parts.push(plural(hours, 'hour'));
  if (mins) parts.push(plural(mins, 'min'));
  if (!days && !hours) parts.push(plural(total % 60, 'sec'));
  return parts.join(', ');
}

function utcOffset(): string {
  const minutes = -new Date().getTimezoneOffset();
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

function memory(): string | null {
  const device = (navigator as NavigatorExtras).deviceMemory;
  const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
  // deviceMemory is rounded and capped at 8 by the browser
  const total = device ? `${device >= 8 ? '8+' : device} GiB` : '';
  const used = heap ? `${Math.round(heap / 2 ** 20)} MiB heap` : '';
  return used && total ? `${used} / ${total}` : used || total || null;
}

function workspaceCounts(): { panes: string; tabs: number } {
  const s = get(workspace);
  const here = leaves(s.root).length;
  const elsewhere = s.tabs.reduce((n, t) => n + (t.data ? leaves(t.data.root).length : 0), 0);
  const panes = s.tabs.length > 1 ? `${here} in this tab, ${here + elsewhere} in all` : String(here);
  return { panes, tabs: s.tabs.length };
}

function systemRows(sys: SystemInfo): InfoRow[] {
  const dpr = Math.round((window.devicePixelRatio || 1) * 100) / 100;
  const theme = get(themeStore);
  const scheme = document.documentElement.style.colorScheme || 'dark';
  const { panes, tabs } = workspaceCounts();
  const threads = navigator.hardwareConcurrency;
  const mem = memory();
  const rows: (InfoRow | null)[] = [
    { label: 'OS', value: [sys.os, sys.arch].filter(Boolean).join(' ') },
    { label: 'Host', value: sys.model ? `${sys.browser} on ${sys.model}` : sys.browser },
    { label: 'Kernel', value: 'svelte 3 / vite 3' },
    { label: 'Uptime', value: formatUptime(performance.now()) },
    { label: 'Shell', value: `portfolio-sh (${commands.filter((c) => !c.hidden).length} commands)` },
    { label: 'Resolution', value: `${screen.width}x${screen.height}${dpr === 1 ? '' : ` @${dpr}x`}, viewport ${innerWidth}x${innerHeight}` },
    { label: 'Theme', value: `${theme} (${scheme})` },
    { label: 'Panes', value: `${panes} · ${plural(tabs, 'tab')}` },
    { label: 'Widgets', value: `${widgets.filter((w) => !w.hidden).length} · ${plural(games.length, 'game')}` },
    threads ? { label: 'CPU', value: `${plural(threads, 'thread')}` } : null,
    mem ? { label: 'Memory', value: mem } : null,
    { label: 'Locale', value: navigator.languages?.slice(0, 3).join(', ') || navigator.language },
    { label: 'Time zone', value: `${Intl.DateTimeFormat().resolvedOptions().timeZone} (${utcOffset()})` },
  ];
  return rows.filter((r): r is InfoRow => r !== null);
}

function plainText(rows: InfoRow[]): string {
  const title = `${USER}@${HOST}`;
  return [title, '-'.repeat(title.length), ...rows.map((r) => `${r.label}: ${r.value}`)].join('\n');
}

const command: CommandDef = {
  name: 'neofetch',
  aliases: ['sysinfo'],
  description: 'system info card: your browser, this workspace and the author',
  usage: 'neofetch [--off|--stdout]',
  group: 'system',
  complete: () => ['--off', '--stdout'],
  run: async (ctx) => {
    const flags = new Set(ctx.args);
    const unknown = ctx.args.filter((a) => a !== '--off' && a !== '--stdout');
    if (unknown.length) return ctx.print(`neofetch: unknown option ${unknown[0]}. usage: neofetch [--off|--stdout]`, 'error');
    const sys = await detectSystem(ctx.signal);
    if (ctx.signal.aborted) return;
    const system = systemRows(sys);
    if (flags.has('--stdout')) return ctx.print(plainText([...system, ...OWNER]));
    ctx.render(Neofetch, { user: USER, host: HOST, system, owner: OWNER, showLogo: !flags.has('--off') });
  },
};

export default command;
