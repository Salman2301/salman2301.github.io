import type { GameDef } from '../../core/types';
import Typer from './Typer.svelte';

const game: GameDef = {
  id: 'typer',
  title: 'Typing Defense',
  description: 'Dev words rain toward your base line. Type them to blast them before they land. Three lives, endless waves.',
  controls: 'type a word to lock on · backspace undo · esc pause · tap the board for the keyboard on phones',
  captureAllKeys: true,
  component: Typer,
};

export default game;
