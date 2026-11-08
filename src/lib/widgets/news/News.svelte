<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { Config } from '../../core/types';
  import { ago, domain, FEEDS, fetchStories, fetchTopSince, itemUrl, PERIODS, type Feed, type Period, type Story } from './hn';

  export let paneId: string;
  export let focused = false;
  export let config: Config = {};
  export let updateConfig: (patch: Config) => void = () => {};
  $: void paneId, focused;

  $: feed = ((config.feed as Feed) || 'top') as Feed;
  $: period = ((config.period as Period) || 'day') as Period;
  /** Which list is showing: "top" is split into day / month / year / live. */
  $: source = feed === 'top' && period !== 'live' ? `top-${period}` : feed;

  let stories: Story[] = [];
  let loading = false;
  let error = '';
  let updated = 0;
  let controller: AbortController | null = null;
  let loadedSource = '';

  function fetchFor(src: string, signal: AbortSignal, fresh: boolean) {
    if (src.startsWith('top-')) return fetchTopSince(src.slice(4) as Exclude<Period, 'live'>, 30, signal, fresh);
    return fetchStories(src as Feed, 30, signal, fresh);
  }

  async function load(src: string, fresh = false) {
    controller?.abort();
    controller = new AbortController();
    loading = true;
    error = '';
    try {
      stories = await fetchFor(src, controller.signal, fresh);
      updated = Date.now();
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') error = 'Could not load Hacker News. Check your connection and retry.';
    } finally {
      loading = false;
    }
  }

  $: if (source !== loadedSource) {
    loadedSource = source;
    load(source);
  }

  // refresh every 10 minutes while open
  let timer: ReturnType<typeof setInterval>;
  onMount(() => (timer = setInterval(() => load(source, true), 10 * 60_000)));
  onDestroy(() => {
    clearInterval(timer);
    controller?.abort();
  });
</script>

<div class="news">
  <div class="bar">
    <span class="logo">Y</span>
    <div class="feeds">
      {#each FEEDS as f}<button class:on={feed === f} on:click={() => updateConfig({ feed: f })}>{f}</button>{/each}
    </div>
    <button class="refresh" on:click={() => load(source, true)} disabled={loading} title="Refresh">{loading ? 'loading' : 'refresh'}</button>
  </div>
  {#if feed === 'top'}
    <div class="periods" role="group" aria-label="Top stories range">
      {#each PERIODS as p}
        <button class:on={period === p} on:click={() => updateConfig({ period: p })}>{p === 'live' ? 'live' : `top ${p}`}</button>
      {/each}
    </div>
  {/if}

  {#if error}
    <div class="msg">{error} <button on:click={() => load(source, true)}>retry</button></div>
  {:else if !stories.length && loading}
    <ol class="list">
      {#each Array(8) as _}<li class="skeleton"><span /><span /></li>{/each}
    </ol>
  {:else}
    <ol class="list">
      {#each stories as s, i (s.id)}
        <li>
          <span class="rank">{i + 1}</span>
          <div class="body">
            <a class="title" href={s.url ?? itemUrl(s.id)} target="_blank" rel="noopener noreferrer">{s.title}</a>
            <span class="meta">
              {s.score} points · {s.by} · {ago(s.time)} ·
              <a href={itemUrl(s.id)} target="_blank" rel="noopener noreferrer">{s.descendants ?? 0} comments</a>
              · <span class="dom">{domain(s.url)}</span>
            </span>
          </div>
        </li>
      {/each}
    </ol>
  {/if}
  {#if updated}<p class="foot">updated {new Date(updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · news.ycombinator.com</p>{/if}
</div>

<style>
  .news {
    height: 100%;
    display: flex;
    flex-direction: column;
    color: var(--t2);
    font-size: 13px;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px dashed color-mix(in srgb, var(--bg2) 80%, transparent);
  }
  .logo {
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    background: #ff6600;
    color: #fff;
    font-weight: 700;
    font-size: 12px;
    border-radius: 3px;
  }
  .feeds {
    display: flex;
    gap: 2px;
    flex: 1;
    overflow: hidden;
  }
  .feeds button,
  .refresh {
    padding: 1px 7px;
    border-radius: 4px;
    font-size: 11px;
    color: var(--t1);
  }
  .feeds button.on {
    color: var(--bg1);
    background: var(--hl1);
  }
  .feeds button:hover:not(.on),
  .refresh:hover {
    color: var(--hl1);
  }
  .periods {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 5px 10px;
    border-bottom: 1px dashed color-mix(in srgb, var(--bg2) 80%, transparent);
  }
  .periods button {
    padding: 1px 8px;
    border-radius: 999px;
    border: 1px solid var(--bg2);
    font-size: 11px;
    color: var(--t1);
  }
  .periods button:hover:not(.on) {
    color: var(--hl1);
    border-color: var(--hl1);
  }
  .periods button.on {
    color: var(--bg1);
    background: var(--hl1);
    border-color: var(--hl1);
  }
  .list {
    flex: 1;
    overflow: auto;
    margin: 0;
    padding: 6px 8px;
    list-style: none;
  }
  li {
    display: flex;
    gap: 10px;
    padding: 6px 4px;
    border-radius: 6px;
  }
  li:hover {
    background: color-mix(in srgb, var(--bg2) 35%, transparent);
  }
  .rank {
    min-width: 20px;
    text-align: right;
    color: var(--t1);
    font-size: 12px;
    padding-top: 1px;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .title {
    color: var(--t2);
    line-height: 1.35;
  }
  .title:visited {
    color: var(--t1);
  }
  .title:hover {
    color: var(--hl1);
  }
  .meta {
    font-size: 11px;
    color: var(--t1);
  }
  .meta a:hover {
    color: var(--hl1);
    text-decoration: underline;
  }
  .dom {
    opacity: 0.8;
  }
  .skeleton span {
    display: block;
    height: 10px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--bg2) 50%, transparent);
    animation: pulse 1.2s ease-in-out infinite;
  }
  .skeleton {
    flex-direction: column;
  }
  .skeleton span:first-child {
    width: 80%;
  }
  .skeleton span:last-child {
    width: 45%;
  }
  .msg {
    padding: 16px;
    color: var(--t1);
  }
  .msg button {
    color: var(--hl1);
    text-decoration: underline;
  }
  .foot {
    padding: 4px 10px;
    font-size: 11px;
    color: var(--t1);
    border-top: 1px dashed color-mix(in srgb, var(--bg2) 80%, transparent);
  }
  @keyframes pulse {
    50% {
      opacity: 0.4;
    }
  }
</style>
