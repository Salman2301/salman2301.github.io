<script lang="ts" context="module">
  export interface InfoRow {
    label: string;
    value: string;
    links?: { text: string; href: string }[];
  }

  type Seg = [text: string, kind: string];

  /*
   * The S2301 mark: a terminal window holding a block-letter S over "2301",
   * with a prompt and a blinking cursor at the bottom. Every line is 21
   * columns wide; each segment carries a colour role.
   */
  const INNER = 19;
  const MARK = [' ▄████████▄ ', '██▀      ▀██', '██▄         ', ' ▀████████▄ ', '         ▀██', '██▄      ▄██', ' ▀████████▀ '];
  const DIGITS = ['▀▀█ ▀▀█ █▀█ ▄█ ', '█▀▀ ▀▀█ █ █  █ ', '▀▀▀ ▀▀▀ ▀▀▀ ▀▀▀'];
  const blank: Seg = [' '.repeat(INNER), ''];
  const framed = (...segs: Seg[]): Seg[] => [['│', 'frame'], ...segs, ['│', 'frame']];

  const LOGO: Seg[][] = [
    [[`╭${'─'.repeat(INNER)}╮`, 'frame']],
    framed([' ', ''], ['●', 'dot-a'], [' ', ''], ['●', 'dot-b'], [' ', ''], ['●', 'dot-c'], [' '.repeat(7), ''], ['s2301', 'tag'], [' ', '']),
    [[`├${'─'.repeat(INNER)}┤`, 'frame']],
    framed(blank),
    ...MARK.map((line) => framed([`   ${line}    `, 'mark'])),
    framed(blank),
    ...DIGITS.map((line) => framed([`  ${line}  `, 'digits'])),
    framed(blank),
    framed([' $ ', 'prompt'], ['█', 'caret-blink'], [' '.repeat(INNER - 4), '']),
    [[`╰${'─'.repeat(INNER)}╯`, 'frame']],
  ];
  const LOGO_COLS = INNER + 2;
</script>

<script lang="ts">
  import { measureWidth } from './live';

  export let user: string;
  export let host: string;
  export let system: InfoRow[] = [];
  export let owner: InfoRow[] = [];
  export let showLogo = true;

  /** Info needs about this many columns before the logo moves above it. */
  const INFO_COLS = 40;
  const GAP_COLS = 3;
  const SWATCHES = ['--bg1', '--bg2', '--t1', '--t2', '--hl1'];

  let stacked = false;
  function onWidth(width: number, fontPx: number) {
    const cols = width / (fontPx * 0.6);
    stacked = cols < LOGO_COLS + GAP_COLS + INFO_COLS;
  }
</script>

<div class="neofetch" class:stacked use:measureWidth={onWidth}>
  {#if showLogo}
    <pre class="logo" aria-label="S2301 logo">{#each LOGO as line}{#each line as [text, kind]}<span class={kind}>{text}</span>{/each}{'\n'}{/each}</pre>
  {/if}
  <div class="info">
    <p class="who"><span class="hl">{user}</span><span class="at">@</span><span class="hl">{host}</span></p>
    <p class="who-rule" aria-hidden="true">{'-'.repeat(user.length + host.length + 1)}</p>
    <dl>
      {#each system as row (row.label)}
        <dt>{row.label}</dt>
        <dd>{row.value}</dd>
      {/each}
    </dl>
    {#if owner.length}
      <dl class="owner">
        {#each owner as row (row.label)}
          <dt>{row.label}</dt>
          <dd>
            {#if row.links}
              {#each row.links as link, i}{#if i}<span class="sep"> · </span>{/if}<a href={link.href} target="_blank" rel="noopener noreferrer">{link.text}</a>{/each}
            {:else}
              {row.value}
            {/if}
          </dd>
        {/each}
      </dl>
    {/if}
    <div class="swatches" aria-label="theme colours">
      {#each SWATCHES as v}<span style="background:var({v})" title={v} />{/each}
    </div>
    <div class="swatches" aria-hidden="true">
      {#each SWATCHES as v}<span style="background:color-mix(in srgb, var({v}) 55%, var(--bg1))" />{/each}
    </div>
  </div>
</div>

<style>
  .neofetch {
    display: flex;
    align-items: flex-start;
    gap: 3ch;
    margin: 4px 0 2px;
  }
  .stacked {
    flex-direction: column;
    gap: 12px;
  }
  .logo {
    margin: 0;
    flex-shrink: 0;
    line-height: 1;
    color: var(--t1);
    user-select: none;
  }
  .logo .frame {
    color: color-mix(in srgb, var(--t1) 75%, var(--bg1));
  }
  .logo .mark {
    color: var(--hl1);
  }
  .logo .digits,
  .logo .prompt {
    color: var(--t2);
  }
  .logo .tag {
    color: var(--t1);
  }
  .logo .dot-a {
    color: var(--hl1);
  }
  .logo .dot-b {
    color: var(--t1);
  }
  .logo .dot-c {
    color: var(--bg2);
  }
  .logo .caret-blink {
    color: var(--hl1);
    animation: blink 1.1s step-end infinite;
  }
  .info {
    min-width: 0;
    flex: 1;
  }
  .who {
    font-weight: 600;
  }
  .hl {
    color: var(--hl1);
  }
  .at {
    color: var(--t2);
  }
  .who-rule {
    color: var(--t1);
    overflow: hidden;
    white-space: nowrap;
  }
  dl {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    column-gap: 1ch;
    margin: 0;
  }
  dt {
    color: var(--hl1);
    font-weight: 600;
  }
  dt::after {
    content: ':';
  }
  dd {
    margin: 0;
    color: var(--t2);
    overflow-wrap: anywhere;
  }
  .owner {
    margin-top: 1.5em;
  }
  a {
    color: var(--t2);
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--hl1) 60%, transparent);
    text-underline-offset: 2px;
  }
  a:hover {
    color: var(--hl1);
  }
  .sep {
    color: var(--t1);
  }
  .swatches {
    display: flex;
    margin-top: 1em;
  }
  .swatches + .swatches {
    margin-top: 0;
  }
  .swatches span {
    width: 3ch;
    height: 1.25em;
  }
  .swatches span:first-child {
    box-shadow: inset 0 0 0 1px var(--bg2);
  }
  @keyframes blink {
    50% {
      opacity: 0;
    }
  }
</style>
