<script lang="ts">
  import type { PageData } from './$types'
  import { fn } from '#lib/models/filename-codec.ts'
  import Header from '#lib/header/Header.svelte'
  import MainBlock from '#lib/MainBlock.svelte'

  export let data: PageData

  function getURL (index, id) {
    return fn`/sign/${index}/${id}`
  }
</script>
<svelte:head>
	<title>Find Sign, List of “{data.index}” entries</title>
</svelte:head>

<Header />

<MainBlock wide>
  <h1>List of “{data.index}” entries</h1>
  <ul>
    {#each data.results as { id, title }}
      <li><a href={getURL(data.index, id)}>{title}</a> <span>({id})</span></li>
    {/each}
  </ul>
</MainBlock>

<style>
  ul li span {
    opacity: 0;
    font-size: 0.9em;
  }
  ul li:hover span {
    opacity: 0.5;
  }
</style>
