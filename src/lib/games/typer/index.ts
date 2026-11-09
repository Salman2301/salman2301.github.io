import type { GameDef } from '../../core/types';
import Typer from './Typer.svelte';

const game: GameDef = {
  id: 'typer',
  title: 'Typing Defense',
  description: 'Dev words rain toward your base line. Type them to blast them before they land. Three lives, endless waves.',
  controls: 'type words to blast them · backspace undo · esc pause · phones: tap the board',
  captureAllKeys: true,
  component: Typer,
};

export default game;
