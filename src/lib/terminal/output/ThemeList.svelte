<script lang="ts">
  import { themeNames, themes, themeStore, setTheme } from '../../core/theme';
</script>

<p class="head">Themes (click to apply, or type: theme &lt;name&gt;)</p>
<div class="list">
  {#each themeNames as name}
    <button class:active={$themeStore === name} on:click={() => setTheme(name)}>
      <span class="swatches">
        {#each themes[name] as c}<span style="background:{c}" />{/each}
      </span>
      {name}
    </button>
  {/each}
</div>

<style>
  .head {
    color: var(--t1);
    margin-bottom: 4px;
  }
  .list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: 4px 12px;
  }
  button {
    display: flex;
    align-items: center;
    gap: 8px;
    text-align: left;
    color: var(--t2);
    padding: 1px 4px;
    border-radius: 4px;
  }
  button:hover {
    color: var(--hl1);
  }
  button.active {
    color: var(--hl1);
    background: color-mix(in srgb, var(--bg2) 60%, transparent);
  }
  .swatches {
    display: inline-flex;
    border-radius: 3px;
    overflow: hidden;
    border: 1px solid var(--bg2);
  }
  .swatches span {
    width: 9px;
    height: 12px;
  }
</style>
