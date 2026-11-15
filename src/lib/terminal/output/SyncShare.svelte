<script lang="ts">
  import { onDestroy } from 'svelte';
  import { encodeQr, qrPath } from '../../core/qr';

  /** The join link, with the token in its #fragment. */
  export let link: string;
  export let server: string;

  const { d, size } = qrPath(encodeQr(link));
  let shown = false;
  let copied = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      copied = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => (copied = false), 2000);
    } catch {
      shown = true; // no clipboard: show it so it can be copied by hand
    }
  }
  onDestroy(() => timer && clearTimeout(timer));
</script>

<div class="share">
  <!-- black on white whatever the theme: phone cameras read that best -->
  <svg class="code" viewBox="0 0 {size} {size}" role="img" aria-label="QR code that joins this workspace">
    <rect width={size} height={size} fill="#fff" />
    <path {d} fill="#000" />
  </svg>
  <div class="text">
    <p class="head">Scan with your phone's camera to sync it with this workspace.</p>
    <p>It opens the site and joins <span class="hl">{server}</span>. A phone with nothing of its own takes this copy; one with its own tasks asks first.</p>
    <p>iPhone: an app on the home screen keeps its own data, apart from Safari. Add the site to the home screen, open it, and run <span class="hl">sync join</span> with this link.</p>
    <p class="warn">The code holds your token: anyone who scans it can read and change your workspace. Show it only to your own devices.</p>
    <div class="acts">
      <button on:click={copy}>{copied ? 'copied' : 'copy link'}</button>
      <button on:click={() => (shown = !shown)}>{shown ? 'hide link' : 'show link'}</button>
    </div>
    {#if shown}<code class="link">{link}</code>{/if}
  </div>
</div>

<style>
  .share {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: flex-start;
    margin: 6px 0 10px;
  }
  .code {
    width: 200px;
    height: 200px;
    flex: 0 0 auto;
    border-radius: 6px;
    shape-rendering: crispEdges;
  }
  .text {
    flex: 1 1 240px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    color: var(--t2);
  }
  p {
    margin: 0;
  }
  .head {
    color: var(--t2);
    font-weight: 600;
  }
  .hl {
    color: var(--hl1);
  }
  .warn {
    color: var(--t1);
    font-size: 12px;
  }
  .acts {
    display: flex;
    gap: 6px;
  }
  .acts button {
    padding: 2px 10px;
    border: 1px solid var(--bg2);
    border-radius: 999px;
    color: var(--t1);
    font-size: 12px;
  }
  .acts button:hover {
    color: var(--hl1);
    border-color: var(--hl1);
  }
  .link {
    font-size: 11px;
    color: var(--t1);
    overflow-wrap: anywhere;
    user-select: all;
  }
</style>
