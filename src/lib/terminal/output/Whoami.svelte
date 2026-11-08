<script lang="ts">
  import { icons } from '../../component/icon/map';

  const links = [
    { name: 'Github', url: 'https://github.com/salman2301', icon: 'github' },
    { name: 'Twitter', url: 'https://twitter.com/salman2301', icon: 'twitter' },
    { name: 'LinkedIn', url: 'https://www.linkedin.com/in/asalman2301/', icon: 'linkedin' },
  ];

  // prettier-ignore
  const banner = [
    '███████╗ █████╗ ██╗     ███╗   ███╗ █████╗ ███╗   ██╗',
    '██╔════╝██╔══██╗██║     ████╗ ████║██╔══██╗████╗  ██║',
    '███████╗███████║██║     ██╔████╔██║███████║██╔██╗ ██║',
    '╚════██║██╔══██║██║     ██║╚██╔╝██║██╔══██║██║╚██╗██║',
    '███████║██║  ██║███████╗██║ ╚═╝ ██║██║  ██║██║ ╚████║',
    '╚══════╝╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝',
  ];
</script>

<div class="whoami">
  <div class="rule"><span>about me</span></div>
  <pre class="banner" aria-label="SALMAN">{#each banner as line, i}<span style="animation-delay:{i * 70}ms">{line}</span>{'\n'}{/each}</pre>
  <p>
    Hello there, welcome to my site! I am <span class="hl">SALMAN</span>, a full stack developer from India. I have 5+ years
    experience in web development. Work mostly with React, NextJS, NodeJS, Typescript, TailwindCSS, GraphQL, Postgres,
    Redis, Docker, Kubernetes, etc.
  </p>
  <p class="gap">
    I am currently working as a <span class="hl">full stack developer</span> at
    <a href="https://www.montotech.com/" target="_blank" rel="noopener noreferrer">Monto</a>.
  </p>
  <p class="label">Social links:</p>
  <div class="links">
    {#each links as link}
      <a class="btn" href={link.url} target="_blank" rel="noopener noreferrer">
        <span class="ic"><svelte:component this={icons[link.icon]} /></span>{link.name}
      </a>
    {/each}
    <a class="btn" href="https://salman2301.com" target="_blank" rel="noopener noreferrer"><span class="ic txt">www</span>Website</a>
  </div>
</div>

<style>
  .whoami {
    max-width: 760px;
  }
  .rule {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--t1);
    text-transform: uppercase;
    letter-spacing: 0.2em;
    font-size: 11px;
    margin: 4px 0 8px;
  }
  .rule::before,
  .rule::after {
    content: '';
    flex: 1;
    border-top: 1px dashed var(--bg2);
  }
  .banner {
    color: var(--hl1);
    font-size: clamp(5px, 1.45vw, 12px);
    line-height: 1;
    margin-bottom: 10px;
    overflow: hidden;
  }
  .banner span {
    display: inline-block;
    animation: rise 0.5s ease-out both;
  }
  .hl {
    color: var(--hl1);
    text-transform: uppercase;
  }
  .gap {
    margin-top: 8px;
  }
  a {
    color: var(--hl1);
  }
  .label {
    margin-top: 10px;
    color: var(--t1);
    font-size: 12px;
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 6px 0 4px;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px 3px 6px;
    border-radius: 6px;
    border: 1px solid var(--bg2);
    color: var(--t2);
    font-size: 12px;
    font-weight: 600;
  }
  .btn:hover {
    border-color: var(--hl1);
    color: var(--hl1);
  }
  .ic {
    display: inline-grid;
    place-items: center;
    transform: scale(0.75);
  }
  .ic.txt {
    transform: none;
    font-size: 10px;
    color: var(--hl1);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
</style>
