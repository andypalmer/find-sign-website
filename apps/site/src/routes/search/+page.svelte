<script lang="ts">
  import type { PageData } from './$types'
  import { getPageStore } from '#lib/functions/legacy-app-stores.ts'
  import regionStore from '#lib/models/region-store.ts'
  import Header from '#lib/header/Header.svelte'
  import MainBlock from '@find-sign/core/ui/MainBlock.svelte'
  import Paginator from '@find-sign/core/ui/Paginator.svelte'
  import Result from '#lib/result/Result.svelte'
  import watchMedia from '#lib/functions/media-store.ts'
  import { closest } from 'fastest-levenshtein'
  import { tokenize } from '@find-sign/core/search/text.ts'
  import { browser } from '$app/env'
  import { fn } from '@find-sign/core/models/filename-codec.ts'
  import { goto } from '$app/navigation'
  import { getSearchLibrary } from '@find-sign/core/search/search.ts'

  const pageStore = getPageStore()

  export let data: PageData
  $: ({ query, page, totalPages, results, viewport, region } = data)

  let didYouMean: string | undefined = undefined
  $: (results.length === 0) && autocorrect(query)

  const media = watchMedia({ phone: '(max-width: 600px)' })
  $: if (browser) viewport = $media.phone ? 'mobile' : 'desktop'

  // attempt to offer autocorrection
  async function autocorrect(query: string) {
    didYouMean = undefined
    const lib = await getSearchLibrary(false, ['words'])
    const words: Set<string> = new Set()
    for (const provider of Object.values(lib)) {
      for (const entry of provider.entries) {
        if (entry.words) entry.words.forEach(word => words.add(word.toLowerCase()))
      }
    }

    const knownWords = [...words]

    const terms = tokenize(query)
    const suggestion = []
    for (const term of terms) {
      if (term.match(/^[a-z0-9_-]+$/)) {
        const nearest = closest(term, knownWords)
        suggestion.push(nearest)
      } else {
        suggestion.push(term)
      }
    }

    if (suggestion.join(' ') !== terms.join(' ')) {
      didYouMean = suggestion.join(' ')
      console.log(didYouMean)
    }
  }

  function regionChangeHandler (event: CustomEvent<{ region: string | false }>) {
    console.log(event)
    if (event.detail.region !== region) {
      const searchParams = new URLSearchParams($pageStore.url.searchParams)
      if (event.detail.region) {
        searchParams.set('r', event.detail.region)
      } else {
        searchParams.delete('r')
      }
      goto(`?${searchParams}`, { replace: true, reset: false })
    }
  }
</script>

<svelte:head>
	<title>“{query}” - Find Sign</title>
  <meta name="robots" content="noindex">
</svelte:head>

<Header {query} showNavigation={false} on:regionChange={regionChangeHandler} />

{#if query === 'admin' && import.meta.env.VITE_ADMIN_URL}
  <div class="hint">Would you like to <a href={import.meta.env.VITE_ADMIN_URL}>Login to Site Admin</a> area?</div>
{/if}

{#if query === 'analytics'}
  <div class="hint">Would you like to <a href="/analytics">view this website’s usage data</a>?</div>
{/if}

{#if query === 'farts'}
  <div class="hint">Have you considered: growing up?</div>
{/if}

{#if query === 'nerds'}
  <div class="hint">Welcome to the club</div>
{/if}

{#if region}
  {@const everythingURL = (() => {
    const p = new URLSearchParams($pageStore.url.searchParams)
    p.delete('r')
    return `?${p}`
  })()}
  <div class="hint">Only showing results in {`${region}`.toUpperCase()}, would you like to <a href="{everythingURL}">see everything</a>?</div>
{/if}
{#if $regionStore && $regionStore !== region}
  {@const limitURL = (() => {
    const p = new URLSearchParams($pageStore.url.searchParams)
    p.set('r', `${$regionStore}`)
    return `?${p}`
  })()}
  <div class="hint">Showing results in every region, would you like to <a href="{limitURL}">limit to only {`${$regionStore}`.toUpperCase()}</a>?</div>
{/if}

{#if results && results.length > 0}
  <div class="results">
    {#each results as entry, idx (`${entry.index}/${entry.id}`)}
      <Result
        data={entry}
        key={idx}
        permalink={fn`/sign/${entry.index || entry.provider?.id}/${entry.id}`}
        prefer={viewport === 'desktop' ? 'performance' : 'quality'} />
    {/each}
  </div>
{:else}
  <MainBlock>
    <h1>No results found</h1>
    {#if didYouMean}
      <p>Did you mean: <a href="?{new URLSearchParams([['query', didYouMean], ['page', '0'], ['vp', viewport === 'mobile' ? 'm' : 'd']])}">{didYouMean}</a>?</p>
    {:else}
      <p>This could be because of a misspelled word</p>
    {/if}
  </MainBlock>
{/if}

{#if totalPages > 0}
  <Paginator
    selected={page}
    length={totalPages}
    toURL={(page) => {
      return `?${new URLSearchParams([
        ['query', query],
        ['page', `${page}`],
        ['vp', viewport === 'mobile' ? 'm' : 'd']
      ])}`
    }}
    />
{/if}

<style>
  .results {
    max-width: 900px;
    margin-left: auto;
    margin-right: auto;
  }

  :global(.spinner) {
    margin-left: auto;
    margin-right: auto;
  }

  .hint {
    margin-left: auto;
    margin-right: auto;
    text-align: center;
    font-style: italic;
  }

  .hint a {
    display: inline-block; /* try not to break over multiple lines if possible */
  }
</style>