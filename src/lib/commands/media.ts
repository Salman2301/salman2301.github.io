import { get } from 'svelte/store';
import type { CommandContext, CommandDef } from '../core/types';
import { openWidget } from '../core/workspace';
import { asItem, labelOf, resolveInput, type MediaItem, type MediaSource, type Preset } from '../widgets/media/media';
import { recentFor, recordPlay } from '../widgets/media/recent';
import { itemsIn, loadSpotify, pauseSpotify, playSpotify, spotifyFavs, spotifyList, spotifyState, stepSpotify, toggleFavItem } from '../widgets/spotify/player';
import { SPOTIFY_PRESETS } from '../widgets/spotify/presets';
import { SPOTIFY } from '../widgets/spotify/spotify';

const LIST_WORDS = ['list', 'ls', 'presets'];

/** Play `item` in the page's one Spotify player, and show its pane. */
function play(ctx: CommandContext, source: MediaSource, presets: Preset[], item: MediaItem) {
  const chosen = recordPlay(source.widget, presets, item);
  loadSpotify(chosen, { play: true });
  openWidget(source.widget, undefined, { from: ctx.paneId });
  ctx.print(`playing ${labelOf(chosen)} on ${source.name}`, 'success');
}

/** The words that control the player instead of naming something to play. Returns true when handled. */
function control(ctx: CommandContext, text: string): boolean {
  const word = text.toLowerCase();
  const current = get(spotifyState).item;
  if (word === 'play' || word === 'resume') {
    playSpotify();
    ctx.print(`playing ${labelOf(current)}`, 'success');
  } else if (word === 'pause' || word === 'stop') {
    pauseSpotify();
    ctx.print('Spotify paused', 'muted');
  } else if (word === 'next' || word === 'prev' || word === 'previous') {
    ctx.print(`playing ${labelOf(stepSpotify(word === 'next' ? 1 : -1))}`, 'success');
  } else if (word === 'fav' || word === 'unfav') {
    const isFav = get(spotifyFavs).some((f) => f.kind === current.kind && f.id === current.id);
    if ((word === 'fav') !== isFav) toggleFavItem(current);
    ctx.print(word === 'fav' ? `★ ${labelOf(current)} is in your favourites` : `${labelOf(current)} removed from your favourites`, word === 'fav' ? 'success' : 'muted');
  } else if (word === 'favs' || word === 'favourites' || word === 'favorites') {
    spotifyList.set('favs');
    const favs = itemsIn('favs');
    if (!favs.length) ctx.print('no favourite playlists yet. Play one, then: spotify fav', 'muted');
    else ctx.print(`favourites (next / prev now step through these):\n${favs.map((f, i) => `  ${i + 1}. ${labelOf(f)}`).join('\n')}`);
  } else return false;
  return true;
}

function printList(ctx: CommandContext, cmd: string, source: MediaSource, presets: Preset[]) {
  const width = Math.max(...presets.map((p) => p.slug.length)) + 2;
  const lines = presets.map((p) => `  ${p.slug.padEnd(width)}${p.name}  ·  ${p.note}`);
  ctx.print(`presets (${cmd} <preset>):\n${lines.join('\n')}`);
  const recent = get(recentFor(source.widget))
    .map((r) => asItem(r, source))
    .filter((r): r is MediaItem => !!r);
  if (recent.length) ctx.print(`recent:\n${recent.map((r, i) => `  ${i + 1}. ${labelOf(r)}`).join('\n')}`, 'muted');
}

function mediaCommand(def: {
  name: string;
  aliases?: string[];
  description: string;
  source: MediaSource;
  presets: Preset[];
  example: string;
  help?: string;
}): CommandDef {
  const { name, source, presets } = def;
  return {
    name,
    aliases: def.aliases,
    description: def.description,
    usage: `${name} [<link>|<preset>|list|play|pause|next|prev|fav|unfav|favs]`,
    help: def.help,
    group: 'widgets',
    complete: (args) => (args.length <= 1 ? [...presets.map((p) => p.slug), 'list', 'play', 'pause', 'next', 'prev', 'fav', 'unfav', 'favs'] : []),
    run: (ctx) => {
      const text = ctx.args.join(' ').trim();
      if (!text) return void openWidget(source.widget, undefined, { from: ctx.paneId });
      if (LIST_WORDS.includes(text.toLowerCase())) return printList(ctx, name, source, presets);
      if (control(ctx, text)) return;
      const item = resolveInput(text, source, presets);
      if (!item) {
        ctx.print(source.invalidHint, 'error');
        ctx.print(`try: ${name} ${def.example}   or a preset: ${presets.map((p) => p.slug).join(', ')}`, 'muted');
        return;
      }
      play(ctx, source, presets, item);
    },
  };
}

const commands: CommandDef[] = [
  mediaCommand({
    name: 'spotify',
    description: 'play a Spotify playlist, album, track or podcast in a pane',
    source: SPOTIFY,
    presets: SPOTIFY_PRESETS,
    example: 'https://open.spotify.com/playlist/...',
    help: `spotify                open the Spotify pane
spotify <link>         play a playlist, album, track, show or artist link
spotify <preset>       play a preset, e.g. spotify lofi  (spotify list shows them)
spotify play | pause
spotify fav | unfav    star what is loaded, or remove the star
spotify favs           list your favourites, and make next / prev step through them
spotify next | prev    the next or previous playlist of the chosen list

There is one Spotify player for the whole page: it keeps playing when you
switch tabs or close the pane, and the status bar controls it. Not logged in
to Spotify in this browser? Then you hear 30-second previews.`,
  }),
];

export default commands;
