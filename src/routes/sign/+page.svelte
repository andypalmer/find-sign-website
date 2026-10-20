<script lang="ts">
  import type { PageData } from './$types'
  import { encodeFilename } from '#lib/models/filename-codec.ts'

  import Header from '#lib/header/Header.svelte'
  import MainBlock from '#lib/MainBlock.svelte'

  export let data: PageData
</script>
<svelte:head>
	<title>Find Sign, list of data sources</title>
</svelte:head>

<Header />

<MainBlock wide>
  <h1>List of Data Sources</h1>
  <ul>
    {#each data.indexes as index}
      <li><a href="/sign/{encodeFilename(index)}">{index}</a></li>
    {/each}
  </ul>
</MainBlock>
