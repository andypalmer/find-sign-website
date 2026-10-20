<script lang="ts">
  export let wide = false
</script>

<main class:wide>
  <slot></slot>
</main>

<style>
  main {
    max-width: 500px;
    min-height: 300px;
    margin: 0 auto 3em auto;
    padding: 0.5rem 0.5rem 0.5rem 0.9rem;
    line-height: 1.35em;
    background-color: var(--module-bg);
    border-radius: 1rem;
    border: 3px solid var(--module-bg);
    color: var(--module-fg);
    overflow: hidden;
    /* very fancy soon to be out of style custom 'neumorphic' style box */
    box-shadow:
    /* outside drop shadow */
    0.3rem 0.6rem 0.8rem hsla(var(--hue), calc(var(--base-bg-sat) + 5%), calc(var(--base-bg-lum) - 6%), var(--outer-shadow-alpha)),
    0.3rem 0.5rem 1.0rem hsla(var(--hue), calc(var(--base-bg-sat) + 5%), calc(var(--base-bg-lum) - 4%), var(--outer-shadow-alpha)),
    0.3rem 0.4rem 1.2rem hsla(var(--hue), calc(var(--base-bg-sat) + 5%), calc(var(--base-bg-lum) - 2%), var(--outer-shadow-alpha)),
    /* outside top highlight */
    -0.3rem -0.6rem 0.8rem hsla(var(--hue), calc(var(--base-bg-sat) - 5%), calc(var(--base-bg-lum) + 6%), var(--outer-highlight-alpha)),
    -0.3rem -0.5rem 1.0rem hsla(var(--hue), calc(var(--base-bg-sat) - 5%), calc(var(--base-bg-lum) + 4%), var(--outer-highlight-alpha)),
    -0.3rem -0.4rem 1.2rem hsla(var(--hue), calc(var(--base-bg-sat) - 5%), calc(var(--base-bg-lum) + 2%), var(--outer-highlight-alpha))
    ;
  }

  main.wide {
    max-width: 900px;
  }

  main :global(a) {
    color: inherit;
  }

  main :global(ul.hashtags > li > span) {
    opacity: 0.5;
    font-size: 70%;
  }

  main :global(h1) {
    font-weight: 200;
    font-style: italic;
    text-align: center;
  }

  main :global(h1::before) { content: "—❮❬   "; }
  main :global(h1::after) { content: "   ❭❯—"; }
  main :global(h1::before), main :global(h1::after) {
    font-style: normal;
    opacity: 0.5;
  }

  @media (max-width: 600px) {
    main :global(h1::before), main :global(h1::after) { content: " — " }
    main :global(h1) {
      line-height: 1.05em;
    }
  }
</style>