import type { GameDef } from '../../core/types';
import Bounce from './Bounce.svelte';

const game: GameDef = {
  id: 'bounce',
  title: 'Bounce',
  description: 'The red ball is back. Collect every ring, dodge the spikes, ride rubber blocks and reach the exit.',
  controls: 'a/d roll · w jump · space pause',
  component: Bounce,
};

export default game;
