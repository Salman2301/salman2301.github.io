import type { GameDef } from '../../core/types';
import Arena from './Arena.svelte';

const game: GameDef = {
  id: 'arena',
  title: 'Snake Arena',
  description: 'Grow by eating, and make other snakes run into you. Nine smart bots hunt, flee and cut you off. Boosting is fast but costs length.',
  controls: 'mouse or a/d steer · hold click or w to boost · space pause',
  scoreLabel: 'length',
  component: Arena,
};

export default game;
