<script lang="ts">
  import Header from '$lib/header/Header.svelte'
  import Result from '$lib/result/Result.svelte'
  import { goto } from '$app/navigation'
  import type { PageData } from './$types'

  export let data: PageData
  $: ({ result, permalink, next } = data)
  $: if (data.redirect) goto(data.redirect)
</script>

<svelte:head>
  <title>Random Sign</title>
  <meta name="robots" content="noindex">
</svelte:head>

<Header/>

<main>
  <h1>Random Sign Generator</h1>

  <h2><a href={next} role="button" class="button" data-sveltekit-noscroll data-sveltekit-preload-data>🎲 Reroll</a></h2>
  <div class="result-box">
    {#key permalink}
      <Result data={result} {permalink} expand prefer="quality" />
    {/key}
  </div>
  <div style="height: 20em"></div>
</main>

<style>
  :global(*) {
    box-sizing: border-box; /* i just like it better ok? microsoft was right */
  }

  :global(body) {
    max-width: 900px;
    margin-left: auto;
    margin-right: auto;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    background-color: var(--base-bg);
    color: var(--base-fg);
  }

  h2 .button {
    --button-hue: calc(var(--hue) - 45deg);
    width: 100%;
    display: block;
    background-color: hsl(var(--button-hue), var(--module-bg-sat), var(--module-bg-lum));
    color: hsl(var(--button-hue), var(--base-fg-sat), var(--base-fg-lum));
    appearance: none;
    padding: 1ex 1em;
    border-radius: calc((1em + 2ex) / 2);
    line-height: 1;
    border: 0 none;
    font-size: inherit;
    font-weight: inherit;
  }

  h2 .button:hover {
    background-color: hsl(var(--button-hue), var(--submodule-bg-sat), var(--submodule-bg-lum));
    cursor: pointer;
  }
</style>