import type { GameDef } from '../../core/types';
import Snake from './Snake.svelte';

const game: GameDef = {
  id: 'snake',
  title: 'Snake',
  description: 'Eat, grow, and do not hit the walls or yourself. It speeds up as you grow.',
  controls: 'arrows / wasd · swipe on touch · p pause',
  component: Snake,
};

export default game;
