<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { widgets } from '../core/registry';

  export let widgetId: string;
  const dispatch = createEventDispatcher<{ choose: string }>();
</script>

<div class="missing">
  <p class="title">Widget "{widgetId}" is not available.</p>
  <p class="sub">Pick something else for this pane:</p>
  <div class="grid">
    {#each widgets.filter((w) => !w.hidden) as w (w.id)}
      <button on:click={() => dispatch('choose', w.id)}><span class="icon">{w.icon}</span>{w.title}</button>
    {/each}
  </div>
</div>

<style>
  .missing {
    height: 100%;
    overflow: auto;
    padding: 16px;
    color: var(--t1);
    font-size: 13px;
  }
  .title {
    color: var(--t2);
    margin-bottom: 4px;
  }
  .sub {
    margin-bottom: 12px;
  }
  .grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  button {
    display: flex;
    gap: 6px;
    align-items: center;
    padding: 4px 10px;
    border: 1px solid var(--bg2);
    border-radius: 6px;
    color: var(--t2);
  }
  button:hover {
    border-color: var(--hl1);
    color: var(--hl1);
  }
  .icon {
    color: var(--hl1);
  }
</style>
