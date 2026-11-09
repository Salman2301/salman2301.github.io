<script lang="ts">
  import { darkTheme, darkThemes, lightTheme, lightThemes, setTheme, setThemeMode, THEME_MODES, themeMode, themes, themeStore } from '../../core/theme';
  const GROUPS = [
    { kind: 'dark', names: darkThemes },
    { kind: 'light', names: lightThemes },
  ];
</script>

<p class="head">
  Mode:
  {#each THEME_MODES as m}<button class="mode" class:active={$themeMode === m} on:click={() => setThemeMode(m)}>{m}</button>{/each}
  <span class="muted">· theme system|dark|light · system follows your OS</span>
</p>
{#each GROUPS as g (g.kind)}
  <p class="head">{g.kind} themes (picked: {g.kind === 'dark' ? $darkTheme : $lightTheme})</p>
  <div class="list">
    {#each g.names as name}
      <button class:active={$themeStore === name} on:click={() => setTheme(name)}>
        <span class="swatches">
          {#each themes[name] as c}<span style="background:{c}" />{/each}
        </span>
        {name}
      </button>
    {/each}
  </div>
{/each}

<style>
  .head {
    color: var(--t1);
    margin: 6px 0 4px;
  }
  .head .mode {
    display: inline;
    padding: 0 4px;
  }
  .muted {
    opacity: 0.7;
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
