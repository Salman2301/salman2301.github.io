import type { GameDef } from '../../core/types';
import Sudoku from './Sudoku.svelte';

const game: GameDef = {
  id: 'sudoku',
  title: 'Sudoku',
  description:
    'Fresh puzzles with one solution in three graded levels. Faster solves score more; hints add 30 s, three mistakes end the run.',
  controls: 'arrows / wasd move · 1-9 enter · 0 erase · n notes · h hint · u undo · space pause',
  scoreLabel: 'points',
  component: Sudoku,
};

export default game;
