import { get } from 'svelte/store';
import type { CommandDef } from '../core/types';
import { activeTaskId, addTask, clearDone, removeTask, setActiveTask, tasks, toggleTask } from '../core/tasks';
import { openWidget } from '../core/workspace';
import {
  fmt, MODE_LABEL, pause, pomodoro, pomodoroStats, remainingMs, reset, setDurations, skip, start, todayKey,
} from '../widgets/pomodoro/engine';
import { ago, domain, FEEDS, fetchStories, itemUrl, type Feed } from '../widgets/news/hn';

const commands: CommandDef[] = [
  {
    name: 'pomodoro',
    aliases: ['pomo', 'focus'],
    description: 'focus timer: start, pause, reset, skip, status or set 50/10/20',
    usage: 'pomodoro [start|pause|reset|skip|status|<focus>/<short>/<long>]',
    group: 'widgets',
    complete: () => ['start', 'pause', 'reset', 'skip', 'status', '25/5/15', '50/10/20'],
    run: (ctx) => {
      const arg = ctx.args[0];
      const status = () => {
        const p = get(pomodoro);
        const t = get(pomodoroStats)[todayKey()] ?? { minutes: 0, sessions: 0 };
        ctx.print(
          `${MODE_LABEL[p.mode]} · ${fmt(get(remainingMs))} ${p.running ? 'running' : 'paused'} · set ${p.cycle % p.longEvery}/${p.longEvery}\n` +
            `durations ${p.durations.focus}/${p.durations.short}/${p.durations.long} min · today ${t.sessions} sessions, ${t.minutes} min`,
        );
      };
      if (!arg) return void openWidget('pomodoro', undefined, { from: ctx.paneId });
      if (arg === 'start') {
        start();
        return ctx.print(`started ${MODE_LABEL[get(pomodoro).mode]}`, 'success');
      }
      if (arg === 'pause') return pause(), ctx.print('paused', 'muted');
      if (arg === 'reset') return reset(), ctx.print('reset', 'muted');
      if (arg === 'skip') return skip(), ctx.print(`now: ${MODE_LABEL[get(pomodoro).mode]}`, 'muted');
      if (arg === 'status') return status();
      const m = /^(\d+)(?:\/(\d+))?(?:\/(\d+))?$/.exec(arg);
      if (m) {
        setDurations({ focus: +m[1], short: m[2] ? +m[2] : undefined, long: m[3] ? +m[3] : undefined });
        return status();
      }
      ctx.print(`usage: ${ctx.raw.split(' ')[0]} [start|pause|reset|skip|status|25/5/15]`, 'error');
    },
  },
  {
    name: 'todo',
    aliases: ['task', 'tasks'],
    description: 'task list: add, done, rm, focus, ls, clear',
    usage: 'todo [add <text>|done <n>|undo <n>|rm <n>|focus <n>|ls|clear]',
    group: 'widgets',
    complete: (args) => (args.length <= 1 ? ['add', 'done', 'undo', 'rm', 'focus', 'ls', 'clear'] : get(tasks).map((_, i) => String(i + 1))),
    run: (ctx) => {
      const [sub, ...rest] = ctx.args;
      const list = get(tasks);
      const pick = () => {
        const n = Number(rest[0]);
        const t = list[n - 1];
        if (!t) ctx.print(`no task #${rest[0] ?? ''}. Try: todo ls`, 'error');
        return t;
      };
      const ls = () => {
        const all = get(tasks);
        if (!all.length) return ctx.print('no tasks. Add one: todo add write the blog post', 'muted');
        const active = get(activeTaskId);
        ctx.print(
          all
            .map((t, i) => `${String(i + 1).padStart(3)}  [${t.done ? 'x' : ' '}] ${t.text}${t.pomodoros ? `  (${t.pomodoros}p)` : ''}${t.id === active ? '  <- focus' : ''}`)
            .join('\n'),
        );
      };
      if (!sub) return void openWidget('todo', undefined, { from: ctx.paneId });
      if (sub === 'ls' || sub === 'list') return ls();
      if (sub === 'add') {
        const t = addTask(rest.join(' '));
        return t ? ctx.print(`added #${get(tasks).length}: ${t.text}`, 'success') : ctx.print('usage: todo add <text>', 'error');
      }
      if (sub === 'clear') return clearDone(), ctx.print('cleared finished tasks', 'muted');
      if (['done', 'undo', 'rm', 'focus'].includes(sub)) {
        const t = pick();
        if (!t) return;
        if (sub === 'rm') removeTask(t.id);
        else if (sub === 'focus') setActiveTask(t.id);
        else if ((sub === 'done') !== t.done) toggleTask(t.id);
        return ls();
      }
      // "todo buy milk" adds directly
      const t = addTask(ctx.args.join(' '));
      if (t) ctx.print(`added #${get(tasks).length}: ${t.text}`, 'success');
    },
  },
  {
    name: 'news',
    aliases: ['hn'],
    description: 'Hacker News top stories (news open shows the widget)',
    usage: 'news [top|new|best|ask|show] [count] | news open',
    group: 'widgets',
    complete: () => [...FEEDS, 'open'],
    run: async (ctx) => {
      if (ctx.args[0] === 'open') return void openWidget('news', undefined, { from: ctx.paneId });
      const feed = (FEEDS.includes(ctx.args[0] as Feed) ? ctx.args[0] : 'top') as Feed;
      const count = Math.min(30, Math.max(1, Number(ctx.args.find((a) => /^\d+$/.test(a))) || 10));
      ctx.print(`fetching ${feed} stories...`, 'muted');
      try {
        const stories = await fetchStories(feed, 30, ctx.signal);
        ctx.print(
          stories
            .slice(0, count)
            .map((s, i) => `${String(i + 1).padStart(2)}. ${s.title}  (${domain(s.url)})\n    ${s.score} points · ${s.descendants ?? 0} comments · ${ago(s.time)} · ${s.url ?? itemUrl(s.id)}`)
            .join('\n'),
        );
        ctx.print('tip: "news open" shows them in a pane', 'muted');
      } catch (e) {
        if ((e as DOMException).name !== 'AbortError') ctx.print('could not reach Hacker News', 'error');
      }
    },
  },
];

export default commands;
