<script lang="ts">
  import { getContext } from 'svelte';
  import { TERMINAL_CTX, type TerminalContext } from '../context';
  import { templatePickerOpen } from '../../core/ui';

  const term = getContext<TerminalContext>(TERMINAL_CTX);

  const chips: { label: string; run?: string; action?: () => void }[] = [
    { label: 'help', run: 'help' },
    { label: 'templates', action: () => templatePickerOpen.set(true) },
    { label: 'pomodoro', run: 'pomodoro' },
    { label: 'tasks', run: 'todo' },
    { label: 'notes', run: 'notes' },
    { label: 'news', run: 'news open' },
    { label: 'play snake', run: 'play snake' },
    { label: 'theme', run: 'theme' },
    { label: 'split', run: 'split' },
  ];
</script>

<div class="motd">
  <p>
    Welcome. This terminal is also a workspace: split panes, resize them, pick a <span class="hl">template</span>, and open
    widgets like a pomodoro, tasks, markdown notes, Hacker News and the arcade.
  </p>
  <div class="chips">
    {#each chips as c}
      <button on:click={() => (c.action ? c.action() : term?.run(c.run ?? c.label))}>{c.label}</button>
    {/each}
  </div>
  <p class="keys">
    <kbd>alt</kbd>+<kbd>t</kbd> templates · <kbd>alt</kbd>+<kbd>\</kbd> split ·
    <kbd>alt</kbd>+<kbd>arrows</kbd> move focus · <kbd>tab</kbd> completes
  </p>
</div>

<style>
  .motd {
    max-width: 760px;
    margin: 4px 0;
  }
  .hl {
    color: var(--hl1);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 8px 0;
  }
  .chips button {
    padding: 1px 10px;
    border-radius: 999px;
    border: 1px solid var(--bg2);
    color: var(--t2);
    font-size: 12px;
  }
  .chips button:hover {
    border-color: var(--hl1);
    color: var(--hl1);
  }
  .keys {
    font-size: 12px;
    color: var(--t1);
  }
  kbd {
    font: inherit;
    padding: 0 4px;
    border-radius: 3px;
    border: 1px solid var(--bg2);
    color: var(--t2);
  }
</style>
