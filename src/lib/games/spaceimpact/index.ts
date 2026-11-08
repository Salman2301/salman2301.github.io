import type { GameDef } from '../../core/types';
import SpaceImpact from './SpaceImpact.svelte';

const game: GameDef = {
  id: 'spaceimpact',
  title: 'Space Impact',
  description: 'The old phone shooter: waves of aliens, power-ups and a boss at the end of every level.',
  controls: 'wasd / arrows fly · hold j or enter to shoot · space pause',
  component: SpaceImpact,
};

export default game;
