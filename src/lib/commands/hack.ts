import { readable, writable, type Writable } from 'svelte/store';
import { startScreensaver } from '../core/screensaver';
import type { CommandContext, CommandDef, Tone } from '../core/types';
import { sleep } from '../terminal/parse';
import Decrypt from '../widgets/matrix/output/Decrypt.svelte';
import LiveLine from '../widgets/matrix/output/LiveLine.svelte';
import type { DecryptState, LiveState } from '../widgets/matrix/output/live';

/**
 * `hack`: a harmless, obviously fake hacking montage. It only prints (then
 * ends in digital rain over the pane): no network, no storage. All state is local to one run, so two terminals can
 * play it at once, and every wait goes through ctx.signal so Ctrl+C stops it.
 */

type PortState = 'open' | 'closed' | 'filtered';
type Port = [port: string, state: PortState, service: string];

interface Script {
  host: string;
  resolved: string;
  route: string;
  ports: Port[];
  /** Printed after the password bar. */
  cracked: string;
  /** Spelled out by the hex dump as it decrypts; 32 bytes fill four rows of eight. */
  secret: string;
  granted: boolean;
  ending: string[];
}

const HOME = 'salman2301.github.io';

const PORTS: Port[] = [
  ['22/tcp', 'open', 'ssh (knock knock)'],
  ['80/tcp', 'open', "http (it's a website)"],
  ['443/tcp', 'open', 'https (safer website)'],
  ['1337/tcp', 'open', 'leet (obviously)'],
  ['3000/tcp', 'closed', 'dev (npm run dev?)'],
  ['8080/tcp', 'filtered', 'coffee (filter coffee)'],
];

function homeScript(): Script {
  return {
    host: HOME,
    resolved: `${HOME} found (a static site, bold move)`,
    route: 'routed via 7 proxies and a smart toaster',
    ports: PORTS,
    cracked: "password found: ******** (it was 'password')",
    secret: 'ACCESS GRANTED. WELCOME, FRIEND!',
    granted: true,
    ending: ["welcome to Salman's portfolio. it was public all along.", 'look around: whoami, help, or template zen to cool down.'],
  };
}

/** Targets that mean this site. */
const HOME_TARGET = /^(salman|salman2301|portfolio|home)\b/;

/** Jokes per target. The first match wins; anything else gets the generic ending. */
const VARIANTS: { match: RegExp; script: (host: string) => Partial<Script> }[] = [
  {
    match: /^nasa\b/,
    script: (host) => ({
      resolved: `${host} found, in low earth orbit`,
      ports: [...PORTS.slice(0, 3), ['5555/tcp', 'filtered', 'telescope (watching)']],
      cracked: 'password not found: it really is rocket science',
      secret: 'NICE TRY :) NICE TRY :) NICE TRY',
      granted: false,
      ending: ['nice try. their firewall has a launch window and you missed it.', 'no packets were harmed: nothing left this browser tab.'],
    }),
  },
  {
    match: /^(fbi|cia|nsa|mi6|interpol|pentagon)\b/,
    script: (host) => ({
      resolved: `${host} found. it found you first`,
      cracked: 'password found: they changed it while we watched',
      secret: 'HELLO. WE CAN SEE YOU TYPING. HI',
      granted: false,
      ending: [`the ${host.split('.')[0].toUpperCase()} would like to know your location.`, 'kidding. this is a portfolio and nothing left this tab.'],
    }),
  },
  {
    match: /^google\b/,
    script: (host) => ({
      resolved: `${host} found (you could have searched for it)`,
      secret: 'IT IS A SEARCH BOX. ENJOY IT :) ',
      ending: ["you're in. it's a search box.", 'next time just type in it.'],
    }),
  },
  {
    match: /^(localhost|127\.0\.0\.1|::1|me|myself|self)$/,
    script: () => ({
      host: 'localhost',
      resolved: 'localhost found. it is you',
      cracked: 'password found: on a sticky note, on your monitor',
      secret: 'YOU HACKED YOURSELF. WELL DONE! ',
      ending: ['you hacked yourself. found: 47 open tabs and a todo list.', 'run todo to inspect the damage.'],
    }),
  },
  {
    match: /^(wifi|wi-fi|router|neighbou?r)/,
    script: () => ({
      host: '192.168.0.1',
      resolved: 'router found, blinking nervously',
      cracked: 'password found: on a sticker under the router',
      secret: 'ADMIN / ADMIN. IT IS ALWAYS THAT',
      ending: ['you are in the router. it wants a firmware update.', 'this is where the movie would end. please do not try it.'],
    }),
  },
];

function genericScript(host: string): Partial<Script> {
  return {
    resolved: `${host} found (probably)`,
    secret: 'TOTALLY REAL DATA. VERY SECRET. ',
    ending: [`you are in ${host}. well, in a drawing of it.`, 'this was fast typing and green text. nothing left this tab.'],
  };
}

/** "https://www.NASA.gov/path" -> "nasa.gov", "the moon" -> "the-moon". Empty when nothing usable is left. */
export function normalizeTarget(arg: string | undefined): string {
  return (arg ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#].*$/, '')
    .replace(/[^a-z0-9.:-]/g, '')
    .slice(0, 40);
}

export function scriptFor(arg: string | undefined): Script {
  const target = normalizeTarget(arg);
  const base = homeScript();
  if (!target || HOME_TARGET.test(target)) return base;
  const variant = VARIANTS.find((v) => v.match.test(target));
  const tld = /^(nasa|fbi|cia|nsa|pentagon)$/.test(target) ? '.gov' : target === 'google' ? '.com' : '';
  const host = target.includes('.') || target.includes(':') ? target : target + tld;
  return { ...base, host, ...(variant ? variant.script(host) : genericScript(host)) };
}

/* ------------------------------------------------------------ the show */

const SPINNER = '|/-\\';

/**
 * Every line goes through LiveLine (a <pre>), so the whole show is monospace
 * and its columns line up. Remembers which lines are still animating, to
 * freeze them on Ctrl+C.
 */
class Show {
  private readonly live = new Set<Writable<LiveState>>();
  private dump: Writable<DecryptState> | null = null;

  constructor(private readonly ctx: CommandContext) {}

  /** Rejects with an AbortError on Ctrl+C, which ends the show. */
  wait(ms: number) {
    return sleep(ms, this.ctx.signal);
  }

  say(text: string, tone: Tone = 'normal', banner = false) {
    this.ctx.render(LiveLine, { state: readable<LiveState>({ text, tone, banner }) });
  }

  private open(state: LiveState): Writable<LiveState> {
    const store = writable(state);
    this.ctx.render(LiveLine, { state: store });
    this.live.add(store);
    return store;
  }

  private close(store: Writable<LiveState>, state: LiveState) {
    store.set(state);
    this.live.delete(store);
  }

  /** Types a line out a few characters at a time. */
  async type(text: string, tone: Tone) {
    const line = this.open({ text: '', tone });
    for (let i = 0; i < text.length; i += 3) {
      line.set({ text: `${text.slice(0, i)}▌`, tone });
      await this.wait(16);
    }
    this.close(line, { text, tone });
  }

  async spin(label: string, ms: number, done: string) {
    const line = this.open({ text: '', tone: 'normal' });
    for (let i = 0; i * 80 < ms; i++) {
      line.set({ text: `[ ${SPINNER[i % SPINNER.length]}  ] ${label}${'.'.repeat(i % 4)}`, tone: 'normal' });
      await this.wait(80);
    }
    this.close(line, { text: `[ ok ] ${done}`, tone: 'success' });
  }

  /** A progress bar that fills in uneven bursts. Stalls (and fails) at `stallAt` when below 1. */
  async bar(label: string, ms: number, stallAt = 1) {
    const ticks = Math.max(1, Math.round(ms / 45));
    const line = this.open({ text: label, tone: 'normal', progress: 0 });
    let progress = 0;
    while (progress < stallAt) {
      progress = Math.min(stallAt, progress + (Math.random() * 2) / ticks);
      line.set({ text: label, tone: 'normal', progress });
      await this.wait(45);
    }
    const failed = stallAt < 1;
    if (failed) await this.wait(450);
    this.close(line, { text: label, tone: failed ? 'error' : 'success', progress });
  }

  /** A hex dump that scrolls, then settles byte by byte into `secret`. */
  async decrypt(secret: string) {
    const dump = writable<DecryptState>({ line: 0, frame: 0, reveal: 0, stopped: false });
    this.dump = dump;
    this.ctx.render(Decrypt, { state: dump, secret, seed: Math.floor(Math.random() * 2 ** 31) });
    for (let line = 1; line <= 16; line++) {
      await this.wait(55);
      dump.update((s) => ({ ...s, line }));
    }
    const steps = 24;
    for (let frame = 1; frame <= steps; frame++) {
      await this.wait(50);
      dump.update((s) => ({ ...s, frame, reveal: frame / steps }));
    }
    this.dump = null;
  }

  /** Freeze whatever is still moving (only after Ctrl+C or a remount). */
  stop() {
    for (const line of this.live) line.update((s) => ({ ...s, stopped: true }));
    this.live.clear();
    this.dump?.update((s) => ({ ...s, stopped: true }));
    this.dump = null;
  }
}

/** At most 40 characters, so a row fits a phone-width terminal. */
const columns = (port: string, state: string, service: string) => `${port.padEnd(9)}${state.padEnd(9)}${service}`;

async function play(ctx: CommandContext, script: Script) {
  const show = new Show(ctx);
  try {
    await show.type('hack.sh 0.0.1 · a show, not a tool · nothing leaves this tab', 'muted');
    await show.type(`target: ${script.host}`, 'accent');
    await show.spin(`resolving ${script.host}`, 640, script.resolved);
    await show.spin('bouncing through proxies', 560, script.route);
    show.say(columns('PORT', 'STATE', 'SERVICE'), 'muted');
    for (const [port, state, service] of script.ports) {
      await show.wait(110);
      show.say(columns(port, state, service), state === 'open' ? 'normal' : 'muted');
    }
    await show.wait(150);
    await show.bar('bypassing firewall', 820);
    await show.bar('cracking password', 700, script.granted ? 1 : 0.99);
    show.say(script.cracked, script.granted ? 'success' : 'error');
    await show.wait(150);
    show.say('decrypting payload...', 'muted');
    await show.decrypt(script.secret);
    await show.wait(250);
    show.say(script.granted ? 'ACCESS GRANTED' : 'ACCESS DENIED', script.granted ? 'accent' : 'error', true);
    for (const line of script.ending) {
      await show.wait(320);
      show.say(line);
    }
    // The finale: digital rain over this pane, the verdict typed on top. Any key returns.
    await show.wait(900);
    startScreensaver('matrix', [`> ${script.host}`, script.granted ? 'ACCESS GRANTED' : 'ACCESS DENIED'], ctx.paneId);
  } finally {
    show.stop();
  }
}

const command: CommandDef = {
  name: 'hack',
  description: 'hack a target (not really, it is a light show)',
  usage: 'hack [target]',
  group: 'fun',
  complete: (args) => (args.length <= 1 ? [HOME, 'nasa', 'fbi', 'google', 'localhost', 'wifi'] : []),
  run: (ctx) => play(ctx, scriptFor(ctx.args.join(' '))),
};

export default command;
