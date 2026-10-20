<script lang="ts">
  import type { PageData } from "./$types"
  import MainBlock from "#lib/MainBlock.svelte"
  import Header from "#lib/header/Header.svelte"

  export let data: PageData

  function url (topic: string) {
    return `/analytics/${topic}`
  }
</script>
<svelte:head>
  <title>Analytics Topics</title>
</svelte:head>

<Header />

<MainBlock>
  <h1>Analytics Topics</h1>
  <ul>
    {#each data.topics as topic}
      <li><a href={url(topic)}>{topic}</a></li>
    {/each}
  </ul>
</MainBlock>
