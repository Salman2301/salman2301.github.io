import type { GameDef } from '../../core/types';
import Racing from './Racing.svelte';

const game: GameDef = {
  id: 'racing',
  title: 'Car Racing',
  description: 'Top-down road racer: weave through traffic on a winding road, grab fuel (F) and nitro (N).',
  controls: 'w gas · s brake · a/d steer · space pause',
  component: Racing,
};

export default game;
