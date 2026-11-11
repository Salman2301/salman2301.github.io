<script lang="ts">
  import { partOfDay, speak } from './words';

  /** The time the way you would say it: "twenty past" over the hour, with the part of the day. */
  export let now: Date;
  export let w = 300;
  export let h = 140;

  $: said = speak(now);
  $: lead = said.minutes.length ? said.minutes.join(' ') : 'exactly';
  $: tail = said.oclock ? " o'clock" : '';
  // the longest line is "a quarter past" / "twenty five past" at 0.42 of the size
  $: fs = Math.max(4, Math.min(w / 4.6, h / 2.5));
</script>

<div class="fuzzy" style="font-size:{fs}px" role="timer" aria-label="{lead} {said.hour}{tail}">
  <span class="lead">{lead}</span>
  <span class="hour">{said.hour}{#if tail}<small>{tail}</small>{/if}</span>
  <span class="part">{partOfDay(now.getHours())}</span>
</div>

<style>
  .fuzzy {
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1.05;
    white-space: nowrap;
  }
  .lead {
    font-size: 0.42em;
    font-weight: 300;
    color: var(--t1);
  }
  .hour {
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--hl1);
  }
  small {
    font-size: 0.42em;
    font-weight: 300;
    color: var(--t2);
  }
  .part {
    margin-top: 0.5em;
    font-size: 0.2em;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--t1);
  }
</style>
