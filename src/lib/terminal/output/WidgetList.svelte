<script lang="ts">
  import { getContext } from 'svelte';
  import { widgets } from '../../core/registry';
  import { TERMINAL_CTX, type TerminalContext } from '../context';

  const term = getContext<TerminalContext>(TERMINAL_CTX);

  const list = widgets.filter((w) => !w.hidden);
</script>

<div class="widgets">
  <p class="head">widgets (click one to open it)</p>
  <ul>
    {#each list as w (w.id)}
      <li>
        <button on:click={() => term?.run(`open ${w.id}`)} title="open {w.id}">
          <span class="icon">{w.icon}</span>
          <span class="id">{w.id}</span>
        </button>
        <span class="desc">{w.description}</span>
      </li>
    {/each}
  </ul>
  <p class="foot">usage: open &lt;widget&gt; [--new]   (opens in this terminal; --new opens a separate pane)</p>
</div>

<style>
  .widgets {
    padding: 2px 0;
  }
  .head {
    color: var(--t1);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 11px;
    margin: 8px 0 2px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: grid;
    grid-template-columns: 22ch 1fr;
    gap: 12px;
    margin-bottom: 2px;
  }
  button {
    display: flex;
    gap: 8px;
    text-align: left;
    color: var(--hl1);
    cursor: pointer;
  }
  button:hover,
  button:focus-visible {
    text-decoration: underline;
    outline: none;
  }
  .icon {
    display: inline-block;
    width: 2ch;
    color: var(--t1);
  }
  .desc {
    color: var(--t2);
    opacity: 0.85;
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
