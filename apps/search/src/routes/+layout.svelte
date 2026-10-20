<script lang="ts">
	import type { LayoutData } from './$types'
	import Spinner from '#lib/Spinner.svelte'
	import { getNavigatingStore } from '#lib/functions/legacy-app-stores.ts'
	import { VECTOR_INDEX, SEARCH_DATA } from '$app/env/public'
	import '@find-sign/core/app.css'

	export let data: LayoutData

	const navigating = getNavigatingStore()

	const preconnectOrigin = [...new Set([
    VECTOR_INDEX,
    SEARCH_DATA
  ].map(x => (new URL(x)).origin))]

	$: loading = $navigating !== null

	// is the page load towards a search results page?
	$: isSearchLoad = $navigating && $navigating.to && $navigating.to.url.pathname === '/search'

	let showSpinner = false
	let timer: ReturnType<typeof setTimeout> | undefined = undefined
	$: if (loading === true && isSearchLoad === false) {
		if (timer) clearTimeout(timer)
		timer = setTimeout(() => showSpinner = true, 50)
	} else if (loading === false) {
		clearTimeout(timer)
		timer = undefined
		showSpinner = false
	}
</script>

<svelte:head>
  <meta name=viewport content="width=device-width">
	{#each preconnectOrigin as origin}
  <link rel="preconnect" href={origin}>
  {/each}
</svelte:head>

<slot></slot>

{#if showSpinner}
	<div class="spinner-overlay">
		<Spinner active={true} />
	</div>
{/if}

<style>
	.spinner-overlay {
		position: fixed;
		top: 0; left: 0; right: 0; bottom: 0;
		display: grid;
		justify-items: center;
		align-items: center;
	}
</style>
