import { get } from 'svelte/store';
import { FACES, findFace, stepFace } from '../widgets/clock/faces';
import type { CommandContext, CommandDef, Config } from '../core/types';
import { leaves, openWidget, updatePaneConfig, workspace, type PaneLeaf } from '../core/workspace';
import {
  cdAdd, cdPause, cdReset, cdStart, countdown, elapsedMs, formatAt, formatClock, formatLength, isDone, lapRows, parseDuration,
  remainingMsOf, stopwatch, swLap, swReset, swStart, swStop,
} from '../widgets/timer/engine';
import {
  allZones, cityName, describeZone, isValidZone, localZone, prefers12h, resolveZone, type ZoneRow,
} from '../widgets/clock/zones';

const usageOf = (ctx: CommandContext, rest: string) => `usage: ${ctx.raw.trim().split(/\s+/)[0]} ${rest}`;

/* ------------------------------------------------------------- countdown */

function countdownStatus(): string {
  const c = get(countdown);
  const left = remainingMsOf(c);
  const of = formatLength(c.durationMs);
  if (c.running) return `countdown ${formatClock(left, { roundUp: true })} left of ${of} · ends at ${formatAt(Date.now() + left)}`;
  if (isDone(c) && c.doneAt) return `countdown done · ${of} ended at ${formatAt(c.doneAt)}`;
  if (left < c.durationMs) return `countdown paused · ${formatClock(left, { roundUp: true })} left of ${of}`;
  return `countdown ready · ${of}. Start one: timer 5m`;
}

const TIMER_USAGE = '[5m|90s|1h30m|1:30|+1m|pause|resume|reset|status|open]';

const timer: CommandDef = {
  name: 'timer',
  description: 'countdown: timer 5m, timer 1:30, +1m, pause, resume, reset, status',
  usage: `timer ${TIMER_USAGE}`,
  group: 'widgets',
  complete: (args) => (args.length <= 1 ? ['5m', '10m', '25m', '90s', '1:30', '1h30m', '+1m', 'pause', 'resume', 'reset', 'status', 'open'] : []),
  run: (ctx) => {
    const sub = (ctx.args[0] ?? '').toLowerCase();
    const c = get(countdown);
    if (!sub || sub === 'open') return void openWidget('timer', { mode: 'countdown' }, { from: ctx.paneId });
    if (sub === 'status') return ctx.print(countdownStatus());
    if (sub === 'pause') {
      if (!c.running) return ctx.print('no countdown is running', 'muted');
      cdPause();
      return ctx.print(countdownStatus(), 'muted');
    }
    if (sub === 'resume' || sub === 'start') {
      if (!c.running) cdStart();
      return ctx.print(countdownStatus(), 'success');
    }
    if (sub === 'reset' || sub === 'stop') {
      cdReset();
      return ctx.print(`countdown reset to ${formatLength(get(countdown).durationMs)}`, 'muted');
    }
    const text = ctx.args.join(' ');
    if (text.startsWith('+')) {
      const ms = parseDuration(text.slice(1));
      if (!ms) return ctx.print(usageOf(ctx, '+<length>, e.g. +1m or +30s'), 'error');
      cdAdd(ms);
      return ctx.print(countdownStatus(), 'success');
    }
    const ms = parseDuration(text);
    if (!ms) return ctx.print(`${usageOf(ctx, TIMER_USAGE)}\nlengths: 90s, 1:30, 5m, 1h20m (a bare number is minutes), from 1s up to 100h`, 'error');
    cdStart(ms);
    ctx.print(`countdown ${formatLength(ms)} started · ends at ${formatAt(Date.now() + ms)}`, 'success');
  },
};

/* ------------------------------------------------------------- stopwatch */

const centis = (ms: number) => formatClock(ms, { centis: true });

function stopwatchStatus(): string {
  const s = get(stopwatch);
  const rows = lapRows(s.laps);
  const best = rows.find((r) => r.best);
  const worst = rows.find((r) => r.worst);
  const ranks = best && worst ? ` · best ${centis(best.lapMs)} (lap ${best.n}), worst ${centis(worst.lapMs)} (lap ${worst.n})` : '';
  const laps = s.laps.length ? ` · ${s.laps.length} lap${s.laps.length === 1 ? '' : 's'}${ranks}` : '';
  return `stopwatch ${centis(elapsedMs(s))} ${s.running ? 'running' : 'stopped'}${laps}`;
}

function lapTable(): string {
  const rows = lapRows(get(stopwatch).laps);
  if (!rows.length) return 'no laps yet. While it runs: sw lap';
  const head = `${'lap'.padStart(4)}  ${'split'.padStart(11)}  ${'total'.padStart(11)}`;
  const body = rows
    .slice()
    .reverse()
    .map((r) => `${String(r.n).padStart(4)}  ${centis(r.lapMs).padStart(11)}  ${centis(r.totalMs).padStart(11)}${r.best ? '  best' : r.worst ? '  worst' : ''}`);
  return [head, ...body].join('\n');
}

const SW_USAGE = '[start|stop|lap|laps|reset|status|open]';

const stopwatchCommand: CommandDef = {
  name: 'stopwatch',
  aliases: ['sw'],
  description: 'stopwatch: start, stop, lap, laps, reset, status',
  usage: `stopwatch ${SW_USAGE}`,
  group: 'widgets',
  complete: (args) => (args.length <= 1 ? ['start', 'stop', 'lap', 'laps', 'reset', 'status', 'open'] : []),
  run: (ctx) => {
    const sub = (ctx.args[0] ?? '').toLowerCase();
    const s = get(stopwatch);
    switch (sub) {
      case '':
      case 'open':
        return void openWidget('timer', { mode: 'stopwatch' }, { from: ctx.paneId });
      case 'start':
      case 'resume':
        swStart();
        return ctx.print(stopwatchStatus(), 'success');
      case 'stop':
      case 'pause':
        if (!s.running) return ctx.print('the stopwatch is not running', 'muted');
        swStop();
        return ctx.print(stopwatchStatus());
      case 'lap': {
        const n = swLap();
        if (!n) return ctx.print('the stopwatch is not running. Start it: sw start', 'error');
        const row = lapRows(get(stopwatch).laps)[0];
        return ctx.print(`lap ${n}  ${centis(row.lapMs)}  total ${centis(row.totalMs)}`);
      }
      case 'laps':
        return ctx.print(lapTable());
      case 'reset':
        swReset();
        return ctx.print('stopwatch reset', 'muted');
      case 'status':
        return ctx.print(stopwatchStatus());
      default:
        ctx.print(usageOf(ctx, SW_USAGE), 'error');
    }
  },
};

/* ----------------------------------------------------------------- clock */

/** The clock pane the commands edit: the focused one, else the first. */
function clockPane(): PaneLeaf | undefined {
  const s = get(workspace);
  const clocks = leaves(s.root).filter((l) => l.widget === 'clock');
  return clocks.find((l) => l.id === s.focused) ?? clocks[0];
}

function zonesOf(config: Config | undefined): string[] {
  const z = config?.zones;
  return Array.isArray(z) ? z.filter((v): v is string => typeof v === 'string' && isValidZone(v)) : [];
}

/** Save to the open clock pane, or open one with this config. */
function writeClock(ctx: CommandContext, patch: Config) {
  const pane = clockPane();
  if (pane) updatePaneConfig(pane.id, patch);
  else openWidget('clock', { face: 'digital', zones: [], ...patch }, { from: ctx.paneId });
}

const slug = (zone: string) => cityName(zone).toLowerCase().replace(/\s+/g, '_');

/** Which listed zone the user means: its number, its IANA name or its city. */
function pickZone(zones: string[], text: string): string | undefined {
  const t = text.trim().toLowerCase();
  if (/^\d+$/.test(t)) return zones[Number(t) - 1];
  const resolved = resolveZone(text);
  return (
    zones.find((z) => z.toLowerCase() === t) ??
    zones.find((z) => slug(z) === t.replace(/\s+/g, '_')) ??
    (resolved ? zones.find((z) => z === resolved) : undefined)
  );
}

function zoneTable(zones: string[], hour12: boolean): string {
  const at = new Date();
  const here = localZone();
  // columns: label, city, weekday and time, offset from here, UTC offset, day change
  const line = (label: string, r: ZoneRow, relative: string) =>
    `${label.padStart(4)}  ${r.city.padEnd(18)} ${r.weekday} ${r.time.padEnd(8)}  ${relative.padEnd(10)} ${r.utc.padEnd(9)} ${r.day}`.trimEnd();
  const out = [line('here', describeZone(here, at, hour12), '')];
  zones.forEach((z, i) => {
    const r = describeZone(z, at, hour12);
    out.push(line(String(i + 1), r, r.relative));
  });
  return out.join('\n');
}

const CLOCK_USAGE = '[<face>|faces|next|prev|add <city|zone>|rm <city|n>|zones|12h|24h]';

const clock: CommandDef = {
  name: 'clock',
  description: 'clock with many faces and world time zones: clock faces, clock flip, clock add tokyo',
  usage: `clock ${CLOCK_USAGE}`,
  group: 'widgets',
  complete: (args) => {
    if (args.length <= 1) return ['faces', 'next', 'prev', 'add', 'rm', 'zones', '12h', '24h', 'open', ...FACES.map((f) => f.id)];
    if (args[0] === 'face') return FACES.map((f) => f.id);
    if (args[0] === 'add') return [...new Set([...allZones().map(slug), ...allZones()])];
    if (args[0] === 'rm') return zonesOf(clockPane()?.config).map(slug);
    return [];
  },
  run: (ctx) => {
    const [first = '', ...rest] = ctx.args;
    const sub = first.toLowerCase();
    const pane = clockPane();
    const zones = zonesOf(pane?.config);
    const hour12 = typeof pane?.config.hour12 === 'boolean' ? (pane.config.hour12 as boolean) : prefers12h();
    switch (sub) {
      case '':
      case 'open':
        return void openWidget('clock', undefined, { from: ctx.paneId });
      case 'add': {
        const text = rest.join(' ');
        if (!text) return ctx.print(usageOf(ctx, 'add <city or zone>, e.g. clock add tokyo'), 'error');
        const zone = resolveZone(text);
        if (!zone) return ctx.print(`no time zone matches "${text}". Try a city (lisbon) or a zone (Europe/Lisbon).`, 'error');
        if (zones.includes(zone)) return ctx.print(`${cityName(zone)} is already on the clock`, 'muted');
        writeClock(ctx, { zones: [...zones, zone] });
        const r = describeZone(zone, new Date(), hour12);
        return ctx.print(`added ${r.city} (${zone}) · ${r.time}${r.day ? ` ${r.day}` : ''} · ${r.relative}`, 'success');
      }
      case 'rm':
      case 'remove': {
        const text = rest.join(' ');
        if (!text) return ctx.print(usageOf(ctx, 'rm <city or number>, see: clock zones'), 'error');
        const zone = pickZone(zones, text);
        if (!zone || !pane) return ctx.print(`"${text}" is not on the clock. See: clock zones`, 'error');
        updatePaneConfig(pane.id, { zones: zones.filter((z) => z !== zone) });
        return ctx.print(`removed ${cityName(zone)}`, 'muted');
      }
      case 'zones':
      case 'ls':
      case 'list':
        ctx.print(zoneTable(zones, hour12));
        if (!zones.length) ctx.print('add a city: clock add tokyo', 'muted');
        return;
      case '12h':
      case '24h':
        writeClock(ctx, { hour12: sub === '12h' });
        return ctx.print(`clock: ${sub}`, 'muted');
      case 'faces': {
        const current = findFace(pane?.config.face)?.id ?? 'digital';
        const width = Math.max(...FACES.map((f) => f.id.length)) + 2;
        ctx.print(FACES.map((f) => `  ${f.id === current ? '*' : ' '} ${f.id.padEnd(width)}${f.name}  ·  ${f.note}`).join('\n'));
        return ctx.print('clock <face> to wear one  ·  clock next / prev  ·  f in the clock pane opens the gallery', 'muted');
      }
      case 'next':
      case 'prev': {
        const next = stepFace(findFace(pane?.config.face)?.id ?? 'digital', sub === 'next' ? 1 : -1);
        writeClock(ctx, { face: next.id });
        return ctx.print(`clock: ${next.name} face`, 'muted');
      }
      default: {
        // "clock flip", "clock face flip", "clock day and night"
        const chosen = findFace(sub === 'face' ? rest.join(' ') : ctx.args.join(' '));
        if (!chosen) {
          ctx.print(usageOf(ctx, CLOCK_USAGE), 'error');
          return ctx.print('see every face: clock faces', 'muted');
        }
        writeClock(ctx, { face: chosen.id });
        ctx.print(`clock: ${chosen.name} face`, 'muted');
      }
    }
  },
};

const commands: CommandDef[] = [timer, stopwatchCommand, clock];

export default commands;
