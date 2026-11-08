import type { GameDef } from '../../core/types';
import Tetris from './Tetris.svelte';

const game: GameDef = {
  id: 'tetris',
  title: 'Tetris',
  description: 'Modern rules: SRS rotation with wall kicks, 7-bag, hold, ghost piece and 3 next pieces.',
  controls: 'a/d move · w rotate · q rotate back · s soft drop · e hard drop · c hold · space pause',
  component: Tetris,
};

export default game;
