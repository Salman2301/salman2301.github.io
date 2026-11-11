<script lang="ts">
  /** The clock as a terminal session: `date` printing the time, the date and the zone. */
  export let now: Date;
  export let hour12 = false;
  export let w = 300;
  export let h = 160;

  const pad = (n: number) => String(n).padStart(2, '0');
  $: time = hour12
    ? `${pad(now.getHours() % 12 || 12)}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${now.getHours() < 12 ? 'AM' : 'PM'}`
    : `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  $: date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${now.toLocaleDateString('en', { weekday: 'short' })}`;
  $: zone = (() => {
    const mins = -now.getTimezoneOffset();
    return `UTC${mins < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(mins) / 60))}:${pad(Math.abs(mins) % 60)}`;
  })();
  // 5 lines, the time at 2.2 of the size: about 11em wide and 7.6em tall
  $: fs = Math.max(2, Math.min(w / 15.4, h / 7.9));
</script>

<div class="term" style="font-size:{fs}px" role="timer" aria-label={time}>
  <p><b>$</b> date +%T</p>
  <p class="big">{time}</p>
  <p><b>$</b> date +%F</p>
  <p class="out">{date} <span>{zone}</span></p>
  <p><b>$</b> <i /></p>
</div>

<style>
  .term {
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
    line-height: 1.35;
    white-space: nowrap;
    color: var(--t1);
  }
  p {
    margin: 0;
  }
  b {
    color: var(--hl1);
    font-weight: 700;
  }
  .big {
    font-size: 2.2em;
    line-height: 1.2;
    color: var(--t2);
    font-variant-numeric: tabular-nums;
  }
  .out {
    color: var(--t2);
  }
  .out span {
    color: var(--t1);
  }
  i {
    display: inline-block;
    width: 0.6em;
    height: 1.05em;
    vertical-align: text-bottom;
    background: var(--hl1);
    animation: blink 1.1s steps(1) infinite;
  }
  @keyframes blink {
    50% {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    i {
      animation: none;
    }
  }
</style>
