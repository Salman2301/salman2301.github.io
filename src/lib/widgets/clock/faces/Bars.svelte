<script lang="ts">
  /** How far through the minute, hour, day, week, month and year you are. */
  export let now: Date;
  export let hour12 = false;
  export let w = 300;
  export let h = 180;

  const pad = (n: number) => String(n).padStart(2, '0');
  $: hours = hour12 ? now.getHours() % 12 || 12 : now.getHours();
  $: time = `${pad(hours)}:${pad(now.getMinutes())}:${pad(now.getSeconds())}${hour12 ? (now.getHours() < 12 ? ' AM' : ' PM') : ''}`;

  function parts(d: Date): { name: string; part: number }[] {
    const sec = d.getSeconds();
    const min = d.getMinutes() + sec / 60;
    const hour = d.getHours() + min / 60;
    const weekday = (d.getDay() + 6) % 7; // Monday first
    const monthDays = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const yearStart = new Date(d.getFullYear(), 0, 1).getTime();
    const yearEnd = new Date(d.getFullYear() + 1, 0, 1).getTime();
    return [
      { name: 'minute', part: sec / 60 },
      { name: 'hour', part: min / 60 },
      { name: 'day', part: hour / 24 },
      { name: 'week', part: (weekday + hour / 24) / 7 },
      { name: 'month', part: (d.getDate() - 1 + hour / 24) / monthDays },
      { name: 'year', part: (d.getTime() - yearStart) / (yearEnd - yearStart) },
    ];
  }
  $: rows = parts(now);
  $: fs = Math.max(2, Math.min(w / 20.6, h / 14.8));
</script>

<div class="bars" style="font-size:{fs}px" role="timer" aria-label={time}>
  <p class="time">{time}</p>
  {#each rows as r (r.name)}
    <div class="row">
      <span class="name">{r.name}</span>
      <span class="track"><span class="fill" style="width:{(r.part * 100).toFixed(2)}%" /></span>
      <span class="pct">{Math.floor(r.part * 100)}%</span>
    </div>
  {/each}
</div>

<style>
  .bars {
    display: flex;
    flex-direction: column;
    gap: 0.55em;
    width: 20em;
    font-variant-numeric: tabular-nums;
  }
  .time {
    margin: 0 0 0.15em;
    font-size: 2em;
    font-weight: 300;
    line-height: 1.1;
    text-align: center;
    color: var(--t2);
  }
  .row {
    display: grid;
    grid-template-columns: 4.2em 1fr 2.8em;
    align-items: center;
    gap: 0.6em;
    color: var(--t1);
  }
  .track {
    height: 0.62em;
    border-radius: 0.31em;
    overflow: hidden;
    background: color-mix(in srgb, var(--bg2) 55%, var(--bg1));
  }
  .fill {
    display: block;
    height: 100%;
    border-radius: 0.31em;
    background: var(--hl1);
    transition: width 0.3s linear;
  }
  .pct {
    text-align: right;
    color: var(--t2);
  }
</style>
