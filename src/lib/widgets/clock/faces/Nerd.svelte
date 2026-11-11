<script lang="ts">
  /** The same moment in the formats a programmer meets: Unix time, ISO 8601, ISO week, day of the year, .beats, hex. */
  export let now: Date;
  export let w = 300;
  export let h = 170;

  const pad = (n: number, len = 2) => String(n).padStart(len, '0');

  function isoWeek(d: Date): string {
    // the week that holds this date's Thursday
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const week = Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7);
    return `${t.getUTCFullYear()}-W${pad(week)}-${day}`;
  }

  function rows(d: Date): [string, string][] {
    const sinceMidnight = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
    const dayOfYear = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 1)) / 86_400_000) + 1;
    // Internet Time: the day in 1000 beats, counted from midnight at UTC+1
    const beats = Math.floor((((d.getUTCHours() + 1) % 24) * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds()) / 86.4);
    return [
      ['unix', String(Math.floor(d.getTime() / 1000))],
      ['iso', d.toISOString().slice(0, 19) + 'Z'],
      ['week', isoWeek(d)],
      ['day', `${pad(dayOfYear, 3)} of ${new Date(d.getFullYear(), 1, 29).getMonth() === 1 ? 366 : 365}`],
      ['beats', `@${pad(beats, 3)}`],
      ['hex', `0x${Math.floor((sinceMidnight / 86_400) * 65_536).toString(16).toUpperCase().padStart(4, '0')}`],
    ];
  }
  $: list = rows(now);
  $: local = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  $: fs = Math.max(2, Math.min(w / 17.5, h / 12.8));
</script>

<div class="nerd" style="font-size:{fs}px" role="timer" aria-label={local}>
  <p class="time">{local}</p>
  <dl>
    {#each list as [name, value] (name)}
      <dt>{name}</dt>
      <dd>{value}</dd>
    {/each}
  </dl>
</div>

<style>
  .nerd {
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .time {
    margin: 0 0 0.25em;
    font-size: 2.2em;
    line-height: 1.15;
    text-align: center;
    color: var(--t2);
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.28em 1em;
    margin: 0;
    line-height: 1.25;
  }
  dt {
    color: var(--hl1);
  }
  dd {
    margin: 0;
    color: var(--t2);
  }
</style>
