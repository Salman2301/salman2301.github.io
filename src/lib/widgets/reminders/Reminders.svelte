<script lang="ts">
  import { isTouch } from '../../core/device';
  import { onDestroy, tick } from 'svelte';
  import { friendlyDate, parseDate, ymd } from '../../core/dates';
  import { openMention } from '../../core/mentions';
  import { requestNotificationPermission } from '../../core/notify';
  import { inList, reminders, type Reminder } from '../../core/reminders';
  import { activeSpace, ALL, spaceForNew, spaceName } from '../../core/spaces';
  import { addTask, addTaskLines, projects, setDue, toggleTask } from '../../core/tasks';
  import type { Config } from '../../core/types';
  import { mention } from '../../ui/mention';

  export let paneId: string;
  export let focused = false;
  export let config: Config = {};
  export let updateConfig: (patch: Config) => void = () => {};
  $: void paneId;

  /* -------------------------------------------------------------- groups */

  let now = new Date();
  const clock = setInterval(() => (now = new Date()), 60_000);
  onDestroy(() => clearInterval(clock));

  $: showDone = config.showDone === true;
  $: today = ymd(now);
  $: tomorrow = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  $: weekEnd = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7));

  /** A reminder's moment, for "overdue" (a date alone is due at the end of its day). */
  const dueAt = (r: Reminder) => (parseDate(r.time ? `${r.day} ${r.time}` : `${r.day} 23:59`)?.getTime() ?? 0);

  // Past dates in notes only show with "show done".
  $: shown = inList($reminders, $activeSpace).filter((r) => !r.upcoming).filter((r) => showDone || (!r.done && !(r.kind === 'note' && r.day < today)));
  $: groups = [
    // Tasks stay overdue until ticked; a date in a note only counts on its own day.
    { id: 'overdue', title: 'overdue', items: shown.filter((r) => !r.done && dueAt(r) < now.getTime() && (r.kind === 'task' ? r.day <= today : r.day === today)) },
    { id: 'today', title: 'today', items: shown.filter((r) => r.day === today && (r.done || dueAt(r) >= now.getTime())) },
    { id: 'tomorrow', title: 'tomorrow', items: shown.filter((r) => r.day === tomorrow) },
    { id: 'week', title: 'this week', items: shown.filter((r) => r.day > tomorrow && r.day <= weekEnd) },
    { id: 'later', title: 'later', items: shown.filter((r) => r.day > weekEnd) },
    { id: 'past', title: 'done and past', items: showDone ? shown.filter((r) => r.day < today && (r.done || r.kind === 'note')) : [] },
  ].filter((g) => g.items.length);

  /* ------------------------------------------------------------ add one */

  let input: HTMLInputElement;
  let text = '';
  let hint = '';

  /** A task with a due date; without a date in the text it is due today. */
  function add() {
    const t = addTask(text, { projectId: spaceForNew() });
    if (!t) {
      hint = 'type something to be reminded of, e.g. call mom @tmrw';
      return;
    }
    if (!t.due) setDue(t.id, today);
    text = '';
    hint = '';
  }

  /** Several pasted lines: a reminder per line (due today unless a line has a date). */
  function onPaste(e: ClipboardEvent) {
    const data = e.clipboardData?.getData('text/plain') ?? '';
    if (!/[\r\n]/.test(data.trim())) return;
    e.preventDefault();
    const added = addTaskLines(data, { projectId: spaceForNew() });
    for (const t of added) if (!t.due && !t.parentId) setDue(t.id, today);
    hint = added.length ? `added ${added.length} reminders` : '';
  }

  /* ------------------------------------------------------- notifications */

  let permission = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  async function enableNotifications() {
    permission = await requestNotificationPermission();
  }

  let wasFocused = false;
  $: {
    if (focused && !wasFocused && !isTouch()) tick().then(() => input?.focus({ preventScroll: true }));
    wasFocused = focused;
  }
</script>

<div class="rem">
  <form on:submit|preventDefault={add}>
    <input
      bind:this={input}
      use:mention={'note'}
      bind:value={text}
      on:paste={onPaste}
      placeholder="remind me to… (call mom @tmrw, pay rent @friday)"
      aria-label="New reminder"
      maxlength="200"
      spellcheck="false"
    />
  </form>
  {#if hint}<p class="hint">{hint}</p>{/if}

  <div class="list">
    {#each groups as g (g.id)}
      <section class:overdue={g.id === 'overdue'}>
        <h3>{g.title} <span class="n">{g.items.length}</span></h3>
        <ul>
          {#each g.items as r (r.kind + r.id + r.day + (r.time ?? ''))}
            <li class:done={r.done}>
              {#if r.kind === 'task'}
                <input type="checkbox" checked={r.done} on:change={() => toggleTask(r.id)} aria-label="Done" />
              {:else}
                <span class="note-ico" title="from a note" />
              {/if}
              <button class="label" on:click={() => openMention(r.kind, r.id)} title={r.kind === 'task' ? 'Open the task' : 'Open the note'}>{r.label}</button>
              {#if r.repeat}<span class="rep" title="repeats {r.repeat}">↻</span>{/if}
              <span class="when">{g.id === 'today' || g.id === 'tomorrow' ? r.time ?? 'all day' : friendlyDate(r.time ? `${r.day} ${r.time}` : r.day)}</span>
              {#if $activeSpace === ALL}<span class="space">{spaceName($projects, r.projectId)}</span>{/if}
            </li>
          {/each}
        </ul>
      </section>
    {:else}
      <p class="empty">Nothing coming up. Add one above, or type @tmrw in a task or a note.</p>
    {/each}
  </div>

  <footer>
    <button class:on={showDone} on:click={() => updateConfig({ showDone: !showDone })}>{showDone ? 'hide done' : 'show done'}</button>
    {#if permission === 'default'}
      <button on:click={enableNotifications} title="Show reminders as system notifications when this tab is in the background">enable notifications</button>
    {:else if permission === 'granted'}
      <span>notifications on</span>
    {/if}
  </footer>
</div>

<style>
  .rep {
    flex: 0 0 auto;
    color: var(--hl1);
    font-size: 11px;
  }
  .rem {
    height: 100%;
    display: flex;
    flex-direction: column;
    color: var(--t2);
    font-size: 13px;
  }
  form {
    padding: 10px 10px 6px;
  }
  form input {
    width: 100%;
    padding: 6px 10px;
    border: 1px solid var(--bg2);
    border-radius: 6px;
    background: transparent;
    color: var(--t2);
    font: inherit;
    outline: none;
  }
  form input:focus {
    border-color: var(--hl1);
  }
  .hint {
    margin: 0 12px 4px;
    color: var(--t1);
    font-size: 11px;
  }
  .list {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 0 10px 8px;
  }
  section {
    margin-top: 8px;
  }
  h3 {
    margin: 0 0 4px;
    color: var(--t1);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .overdue h3 {
    color: var(--hl1);
  }
  .n {
    margin-left: 4px;
    font-weight: 400;
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px;
    border-radius: 6px;
  }
  li:hover {
    background: color-mix(in srgb, var(--bg2) 40%, transparent);
  }
  .overdue li {
    box-shadow: inset 2px 0 0 var(--hl1);
  }
  li input {
    accent-color: var(--hl1);
    cursor: pointer;
  }
  .note-ico {
    flex: none;
    width: 9px;
    height: 11px;
    margin: 0 2px;
    border: 1.5px solid var(--t1);
    border-radius: 1px;
    box-sizing: border-box;
  }
  .label {
    flex: 1;
    min-width: 0;
    text-align: left;
    color: var(--t2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .label:hover {
    color: var(--hl1);
  }
  .done .label {
    color: var(--t1);
    text-decoration: line-through;
  }
  .when {
    flex: none;
    color: var(--t1);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .space {
    flex: none;
    max-width: 90px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 0 6px;
    border: 1px solid var(--bg2);
    border-radius: 999px;
    color: var(--t1);
    font-size: 10px;
  }
  .empty {
    padding: 14px 4px;
    color: var(--t1);
  }
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 10px;
    border-top: 1px dashed color-mix(in srgb, var(--bg2) 80%, transparent);
    color: var(--t1);
    font-size: 11px;
  }
  footer button {
    padding: 1px 6px;
    border-radius: 4px;
    color: var(--t1);
  }
  footer button:hover,
  footer button.on {
    color: var(--hl1);
  }
</style>
