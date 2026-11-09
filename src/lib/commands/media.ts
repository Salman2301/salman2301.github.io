import { get } from 'svelte/store';
import type { CommandContext, CommandDef } from '../core/types';
import { openWidget } from '../core/workspace';
import { asItem, labelOf, resolveInput, type MediaItem, type MediaSource, type Preset } from '../widgets/media/media';
import { recentFor, recordPlay } from '../widgets/media/recent';
import { SPOTIFY_PRESETS } from '../widgets/spotify/presets';
import { SPOTIFY } from '../widgets/spotify/spotify';

const LIST_WORDS = ['list', 'ls', 'presets'];

/** Open (or reuse) the widget's pane with `item`, and remember it. */
function play(ctx: CommandContext, source: MediaSource, presets: Preset[], item: MediaItem) {
  const chosen = recordPlay(source.widget, presets, item);
  openWidget(source.widget, { item: chosen }, { from: ctx.paneId });
  ctx.print(`playing ${labelOf(chosen)} on ${source.name}`, 'success');
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
}): CommandDef {
  const { name, source, presets } = def;
  return {
    name,
    aliases: def.aliases,
    description: def.description,
    usage: `${name} [<link>|<preset>|list]`,
    group: 'widgets',
    complete: (args) => (args.length <= 1 ? [...presets.map((p) => p.slug), 'list'] : []),
    run: (ctx) => {
      const text = ctx.args.join(' ').trim();
      if (!text) return void openWidget(source.widget, undefined, { from: ctx.paneId });
      if (LIST_WORDS.includes(text.toLowerCase())) return printList(ctx, name, source, presets);
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
  }),
];

export default commands;
