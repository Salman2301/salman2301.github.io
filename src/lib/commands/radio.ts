import { get } from 'svelte/store';
import type { CommandDef } from '../core/types';
import { openWidget } from '../core/workspace';
import { pause, radioFavs, radioList, radioState, RADIO_LISTS, stationsIn, stepStation, toggleFavStation, tune } from '../widgets/radio/player';
import { findStation, GENRES, STATIONS, type Station } from '../widgets/radio/stations';

const WORDS = ['next', 'prev', 'list', 'favs', 'fav', 'unfav', 'stop'];

function table(stations: Station[], favs: string[]): string {
  const width = Math.max(...stations.map((s) => s.slug.length)) + 2;
  return stations.map((s) => `  ${favs.includes(s.slug) ? '★' : ' '} ${s.slug.padEnd(width)}${s.name}  ·  ${s.note}`).join('\n');
}

const command: CommandDef = {
  name: 'radio',
  description: 'tune in to a free live radio station, keep favourites, or stop the radio',
  usage: 'radio [<station>|next|prev|list [<genre>]|favs|fav [<station>]|unfav [<station>]|stop]',
  group: 'widgets',
  help: `radio                  open the radio pane
radio <station>        tune in, e.g. radio fip
radio list             every station, by genre (★ marks your favourites)
radio list <genre>     one genre: ${GENRES.join(', ')}
radio fav [<station>]  add the current (or named) station to your favourites
radio unfav [<station>]
radio favs             list your favourites, and make next / prev step through them
radio next | prev      the next or previous station of the chosen list
radio stop

The status bar shows the player: its name opens the full controls.`,
  complete: (args) => {
    if (args.length <= 1) return [...STATIONS.map((s) => s.slug), ...WORDS];
    if (args.length === 2 && (args[0] === 'list' || args[0] === 'ls')) return [...GENRES];
    if (args.length === 2 && (args[0] === 'fav' || args[0] === 'unfav')) return STATIONS.map((s) => s.slug);
    return [];
  },
  run: (ctx) => {
    const [first = '', ...more] = ctx.args.join(' ').trim().toLowerCase().split(/\s+/);
    const rest = more.join(' ');
    const word = [first, rest].filter(Boolean).join(' ');
    const favs = get(radioFavs);
    if (!first) return void openWidget('radio', undefined, { from: ctx.paneId });
    if (first === 'next' || first === 'prev' || first === 'previous') {
      const st = stepStation(first === 'next' ? 1 : -1);
      return ctx.print(`tuning in to ${st.name}`, 'success');
    }
    if (first === 'stop' || first === 'pause') {
      pause();
      return ctx.print('radio stopped', 'muted');
    }
    if (first === 'list' || first === 'ls') {
      if (rest && !RADIO_LISTS.some((l) => l.id === rest)) return ctx.print(`no genre called "${rest}". Genres: ${GENRES.join(', ')}`, 'error');
      const genres = rest && rest !== 'all' && rest !== 'favs' ? [rest] : rest === 'favs' ? [] : [...GENRES];
      if (rest === 'favs') return void ctx.run('radio favs');
      for (const g of genres) ctx.print(`${g}\n${table(stationsIn(g), favs)}`);
      return ctx.print('radio <station> to tune in  ·  radio fav <station> to star one', 'muted');
    }
    if (first === 'favs' || first === 'favourites' || first === 'favorites') {
      radioList.set('favs');
      if (!favs.length) return ctx.print('no favourite stations yet. Star one with: radio fav <station>', 'muted');
      return ctx.print(`favourites (next / prev now step through these):\n${table(stationsIn('favs'), favs)}`);
    }
    if (first === 'fav' || first === 'unfav') {
      const st = rest ? findStation(rest) : get(radioState).station;
      if (!st) return ctx.print(`no station called "${rest}"`, 'error');
      const isFav = favs.includes(st.slug);
      if ((first === 'fav') !== isFav) toggleFavStation(st.slug);
      return ctx.print(first === 'fav' ? `★ ${st.name} is in your favourites` : `${st.name} removed from your favourites`, first === 'fav' ? 'success' : 'muted');
    }
    const station = findStation(word);
    if (!station) {
      ctx.print(`no station called "${word}"`, 'error');
      return ctx.print(`try: radio ${STATIONS[0].slug}   or radio list`, 'muted');
    }
    tune(station);
    openWidget('radio', undefined, { from: ctx.paneId });
    ctx.print(`tuning in to ${station.name}`, 'success');
  },
};

export default command;
