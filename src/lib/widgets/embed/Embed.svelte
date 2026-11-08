<script lang="ts">
  import type { Config } from '../../core/types';

  export let paneId: string;
  export let focused = false;
  export let config: Config = {};
  export let updateConfig: (patch: Config) => void = () => {};
  $: void paneId, focused;

  let draft = '';
  let frameKey = 0;

  $: url = typeof config.url === 'string' ? config.url : '';
  $: src = toEmbedUrl(url);

  /** Turn a normal YouTube link into its embeddable form; anything else is used as-is. */
  function toEmbedUrl(raw: string): string {
    if (!raw) return '';
    try {
      const u = new URL(raw);
      const host = u.hostname.replace(/^www\./, '');
      let id = '';
      if (host === 'youtu.be') id = u.pathname.slice(1);
      else if (host === 'youtube.com' || host === 'm.youtube.com') {
        const m = u.pathname.match(/^\/(?:embed|shorts)\/([\w-]+)/);
        id = u.searchParams.get('v') ?? (m ? m[1] : '');
      }
      return id ? `https://www.youtube.com/embed/${id}` : u.href;
    } catch {
      return '';
    }
  }

  function go() {
    let v = draft.trim();
    if (!v) return;
    if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
    try {
      new URL(v);
    } catch {
      return;
    }
    updateConfig({ url: v });
    draft = '';
  }
</script>

<div class="embed">
  <form class="bar" on:submit|preventDefault={go}>
    <input type="text" bind:value={draft} placeholder={url || 'paste a link and press enter'} aria-label="Address" spellcheck="false" autocapitalize="off" />
    {#if url}
      <button type="button" class="btn" on:click={() => frameKey++} title="Reload">reload</button>
      <a class="btn" href={url} target="_blank" rel="noopener noreferrer" title="Open in a new tab">open</a>
    {/if}
  </form>

  {#if src}
    {#key frameKey}
      <iframe
        {src}
        title={url}
        loading="lazy"
        referrerpolicy="strict-origin-when-cross-origin"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write"
        allowfullscreen
      />
    {/key}
    <p class="hint">Blank? That site blocks embedding. Use "open" to view it in a tab.</p>
  {:else}
    <div class="empty">
      <p>Embed a web page or a video in this pane.</p>
      <p class="muted">YouTube links play inline. Or type <code>embed &lt;url&gt;</code> in the terminal.</p>
    </div>
  {/if}
</div>

<style>
  .embed {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
    color: var(--t2);
    font-size: 12px;
  }
  .bar {
    display: flex;
    gap: 6px;
    padding: 6px 8px;
    border-bottom: 1px dashed color-mix(in srgb, var(--bg2) 80%, transparent);
  }
  .bar input {
    flex: 1;
    min-width: 0;
    padding: 3px 8px;
    border-radius: 6px;
    border: 1px solid var(--bg2);
    background: var(--bg1);
    color: var(--t2);
    font: inherit;
    font-size: 12px;
    outline: none;
  }
  .bar input:focus {
    border-color: var(--hl1);
  }
  .btn {
    padding: 2px 8px;
    border-radius: 6px;
    border: 1px solid var(--bg2);
    color: var(--t1);
    font-size: 11px;
    text-decoration: none;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
  }
  .btn:hover {
    color: var(--hl1);
    border-color: var(--hl1);
  }
  iframe {
    flex: 1;
    width: 100%;
    min-height: 0;
    border: 0;
    background: #fff;
  }
  .hint {
    padding: 4px 8px;
    font-size: 11px;
    color: var(--t1);
    border-top: 1px dashed color-mix(in srgb, var(--bg2) 80%, transparent);
  }
  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 16px;
    text-align: center;
  }
  .empty p {
    margin: 0;
  }
  .muted {
    color: var(--t1);
  }
  code {
    color: var(--hl1);
  }
</style>
