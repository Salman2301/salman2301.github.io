import type { GameDef } from '../../core/types';
import Runner from './Runner.svelte';

const game: GameDef = {
  id: 'runner',
  title: 'Byte Runner',
  description: 'Endless run as a blinking cursor: hop bugs and {} stacks, duck packets, grab $ and .exe chips.',
  controls: 'w / j / tap jump (hold higher) · s / swipe down duck · space pause',
  touch: [{ label: 'jump', code: 'KeyJ', key: 'j' }],
  component: Runner,
};

export default game;
