<script lang="ts">
  import { getContext } from "svelte";
  import { CONTEXT_KEY } from "../../constant";
  import type { Writable } from "svelte/store";

  const historyCommands: Writable<any[]> = getContext(CONTEXT_KEY.$HISTORY);

  function getLast10History() {
    return $historyCommands.slice(-10);
  }
</script>

<p>List of commands:</p>

<ol>
  {#each getLast10History() as command}
    <li>
      {command}
    </li>
  {/each}
</ol>

<style lang="postcss">
  ol {
    list-style-type: decimal;
    margin-left: 18px;
  }

</style>