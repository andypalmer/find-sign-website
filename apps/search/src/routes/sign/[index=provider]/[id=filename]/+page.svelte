<script lang="ts">
  import type { PageData } from './$types'
  import Header from '#lib/header/Header.svelte'
  import Result from '#lib/result/Result.svelte'
  import { getPageStore } from '#lib/functions/legacy-app-stores.ts'
  import { onMount } from 'svelte'
  import clientRecordAnalytics from '#lib/models/client-record-analytics.ts'

  const page = getPageStore()

  export let data: PageData
  $: result = data.result

  const ogVideoTypePreference = ['video/mp4', 'video/webm']

  $: selectedVideoOffset = parseInt($page.url.searchParams.get('carousel0') || '0')
  $: selectedVideo = result.media[selectedVideoOffset]
  $: selectedVideoOG = selectedVideo.encodes.sort((a, b) => ogVideoTypePreference.indexOf(a.type) - ogVideoTypePreference.indexOf(b.type))[0]

  onMount(() => {
    clientRecordAnalytics('permalink', fetch)
  })
</script>
<svelte:head>
	<title>{result.provider?.name || result.provider?.id}’s “{result.title || result.words.join(' ')}”</title>
  <meta property="og:title" content="Auslan: “{result.title || result.words.join(' ')}”">
  <meta property="og:type" content="video">
  <meta property="og:description" content="{result.body}">
  <meta property="og:video" content="{selectedVideoOG.url}">
  <meta property="og:video:type" content="{selectedVideoOG.type}">
  <meta property="og:video:width" content="{selectedVideoOG.width.toString()}">
  <meta property="og:video:height" content="{selectedVideoOG.height.toString()}">
  <meta property="og:image" content="{selectedVideo.thumbnail}">
  {@html `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: result.title || result.words.join(' '),
    description: result.body,
    thumbnailUrl: [selectedVideo.thumbnail],
    uploadDate: result.timestamp
      ? (new Date(result.timestamp)).toISOString()
      : undefined,
    duration: `PT${Math.ceil(selectedVideoOG.duration)}S`, //"PT1M54S",
    contentUrl: selectedVideoOG.url,
    contentSize: selectedVideoOG.byteSize,
    encodingFormat: selectedVideoOG.type,
    width: selectedVideoOG.width,
    height: selectedVideoOG.height,
    creator: result.author ? {
      name: result.author.name || result.author.id,
      url: result.author.link,
      image: result.author.avatar
    } : {
      name: result.provider?.name || result.provider?.id,
      url: result.provider?.link,
    }
  })}</script>`}
</svelte:head>


<Header />

<div>
  <Result key={0} data={result} expand allTags prefer="quality" />
</div>

<style>
  div {
    max-width: 900px;
    margin-left: auto;
    margin-right: auto;
    margin-bottom: 50vh;
  }
</style>