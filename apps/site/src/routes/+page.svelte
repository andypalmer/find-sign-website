<script lang="ts">
	import type { PageData } from './$types'
	import Header from '#lib/header/Header.svelte'
	import DiscoveryFeed from '#lib/DiscoveryFeed.svelte'
	import { onMount } from 'svelte'
	import { goto, preloadCode } from '$app/navigation'
	import watchMedia from '#lib/functions/media-store.ts'
	import openGraphImage from '#lib/assets/open-graph-image@3x.png'
	import { getPageStore } from '#lib/functions/legacy-app-stores.ts'
	import clientRecordAnalytics from '#lib/models/client-record-analytics.ts'
	import { browser } from '$app/env'

	const page = getPageStore()

	export let data: PageData

	const openGraphImageFullURL = (new URL(openGraphImage, $page.url)).toString()
	const media = watchMedia({ phone: '(max-width: 600px)' })

	onMount(() => {
		// preload the search results interface
		preloadCode('/search')

		const hash = window.location.hash
		if (typeof hash === 'string' && hash.startsWith('#') && hash.endsWith('/0')) {
			// legacy find sign search url, redirect
			const query = decodeURIComponent(hash.slice(1).split('/')[0])
			goto(`/search?${new URLSearchParams([
				['query', query],
				['page', '0'],
				['vp', $media.phone ? 'm' : 'd']
			])}`)
		}

		if (browser && !data.automated) {
			clientRecordAnalytics('homepage', fetch)
		}
	})
</script>

<svelte:head>
	<title>Find Sign</title>
	<meta property=og:image content={openGraphImageFullURL}>
  <meta property=og:description content="Find Sign is an Auslan Search Engine. It helps find Auslan resources from around the internet in one place.">
  <meta property=og:title content="Find Sign - Auslan Search Engine">
</svelte:head>

<Header/>

<DiscoveryFeed feed={data.feed} />