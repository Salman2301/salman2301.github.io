<script lang="ts">
  import { getContext } from 'svelte';
  import { commands } from '../../core/registry';
  import type { CommandGroup } from '../../core/types';
  import { TERMINAL_CTX, type TerminalContext } from '../context';

  const term = getContext<TerminalContext>(TERMINAL_CTX);

  const ORDER: { id: CommandGroup; title: string }[] = [
    { id: 'general', title: 'general' },
    { id: 'workspace', title: 'workspace & templates' },
    { id: 'widgets', title: 'widgets' },
    { id: 'games', title: 'games' },
    { id: 'fun', title: 'fun' },
    { id: 'system', title: 'system' },
  ];

  const groups = ORDER.map((g) => ({
    ...g,
    items: commands.filter((c) => !c.hidden && (c.group ?? 'general') === g.id).sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((g) => g.items.length);
</script>

<div class="help">
  {#each groups as g (g.id)}
    <p class="group">{g.title}</p>
    <ul>
      {#each g.items as c (c.name)}
        <li>
          <button on:click={() => term?.run(c.name)} title={c.usage ?? c.name}>{c.name}</button>
          <span class="desc">{c.description}{#if c.aliases?.length}<span class="alias">{' '}(also: {c.aliases.join(', ')})</span>{/if}</span>
        </li>
      {/each}
    </ul>
  {/each}
  <p class="foot">tab completes · up/down history · ctrl+c stops · ctrl+l clears · chain with &&</p>
</div>

<style>
  .help {
    padding: 2px 0;
  }
  .group {
    color: var(--t1);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 11px;
    margin: 8px 0 2px;
  }
  li {
    display: grid;
    grid-template-columns: 14ch 1fr;
    gap: 12px;
  }
  button {
    text-align: left;
    color: var(--hl1);
  }
  button:hover {
    text-decoration: underline;
  }
  .desc {
    color: var(--t2);
    opacity: 0.85;
  }
  .alias {
    color: var(--t1);
  }
  .foot {
    margin-top: 8px;
    color: var(--t1);
    font-size: 12px;
  }
  @media (max-width: 520px) {
    li {
      grid-template-columns: 1fr;
      gap: 0;
      margin-bottom: 4px;
    }
  }
</style>
