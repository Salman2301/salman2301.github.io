<script lang="ts">
  import { fly } from 'svelte/transition';
  import { dismiss, toasts } from '../core/notify';
</script>

<div class="toasts" aria-live="polite">
  {#each $toasts as t (t.id)}
    <button class="toast tone-{t.tone}" transition:fly={{ y: 12, duration: 180 }} on:click={() => dismiss(t.id)}>
      <span class="title">{t.title}</span>
      {#if t.body}<span class="body">{t.body}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    right: 14px;
    bottom: 38px;
    z-index: 95;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-end;
    pointer-events: none;
  }
  .toast {
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
    text-align: left;
    min-width: 220px;
    max-width: min(360px, calc(100vw - 28px));
    padding: 10px 14px;
    border-radius: 8px;
    border: 1px solid var(--bg2);
    border-left: 3px solid var(--hl1);
    background: var(--bg1);
    color: var(--t2);
    box-shadow: 0 12px 30px -10px rgba(0, 0, 0, 0.6);
  }
  .tone-success {
    border-left-color: #4ade80;
  }
  .tone-error {
    border-left-color: #ff6b6b;
  }
  .title {
    font-size: 13px;
  }
  .body {
    font-size: 12px;
    color: var(--t1);
  }
</style>
