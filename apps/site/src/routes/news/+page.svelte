<script lang="ts">
  import type { PageData } from './$types'
	import Header from '#lib/header/Header.svelte'
  import MainBlock from '@find-sign/core/ui/MainBlock.svelte'

  import { humane as humaneTime } from '@find-sign/core/functions/date.ts'

  export let data: PageData
</script>

<svelte:head>
	<title>Find Sign</title>
	<meta property=og:image content=https://find.auslan.fyi/style/assets/open-graph-image@3x.png>
  <meta property=og:description content="Find Sign is an Auslan Search Engine. It helps find Auslan resources from around the internet in one place.">
  <meta property=og:title content="Find Sign - Auslan Search Engine">
</svelte:head>

<Header/>

{#each data.feed as entry}
  <MainBlock wide>
    {#if entry.title}<h2>{entry.title}</h2>{/if}
    {@html entry.description}
    {#if entry.pubDate}<time>{humaneTime(entry.pubDate)}</time>{/if}
  </MainBlock>
{/each}
