import type { GameDef } from '../../core/types';
import Bricks from './Bricks.svelte';

const game: GameDef = {
  id: 'bricks',
  title: 'Brick Breaker',
  description: 'Bounce the ball through hand-built brick art, catch power-ups and chain hits for combos.',
  controls: 'a/d or drag move · w / tap launch · j laser · space pause',
  touch: [{ label: 'fire', code: 'KeyJ', key: 'j' }],
  component: Bricks,
};

export default game;
