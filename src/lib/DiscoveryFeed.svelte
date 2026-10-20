<script lang=ts>
  import Icon from '#lib/Icon.svelte'
  import MainBlock from '#lib/MainBlock.svelte'
  import { humane as humaneTime } from '#lib/functions/date.ts'

  type FeedItem = { author: { name?: string, url?: string }, verb?: string, title: string, date: string, cacheURL?: string, remoteURL?: string }

  export let feed: FeedItem[] | undefined = undefined

  // local calendar date, for <time datetime>
  function dateOnly (timestamp: number): string {
    const date = new Date(timestamp)
    return [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(n => `${n}`.padStart(2, '0')).join('-')
  }

  // group entries by day, with humane headings
  function dateGrouped (entries: FeedItem[]) {
    const grouped: { humane: string, computer: string, entries: FeedItem[] }[] = []
    for (const entry of entries) {
      const timestamp = Date.parse(entry.date)
      const humane = humaneTime(timestamp)
      if (grouped.length === 0 || grouped[0].humane !== humane) {
        grouped.unshift({
          humane,
          computer: dateOnly(timestamp),
          entries: [entry]
        })
      } else {
        grouped[0].entries.unshift(entry)
      }
    }
    return grouped
  }
</script>

<svelte:head>
	<link rel="alternate" title="Recently Added (JSON)" type="application/json" href="/feeds/discovery.json">
	<link rel="alternate" title="Recently Added (Atom)" type="application/atom+xml" href="/feeds/discovery.atom">
	<link rel="alternate" title="Recently Added (RSS)" type="application/rss+xml" href="/feeds/discovery.rss">
</svelte:head>

<MainBlock>
  {#if feed}
    <div class="h-feed">
      <a href={'/feeds/discovery.atom'} class="icon-feed" title="Atom Feed"><Icon name=feed/></a>
      {#each dateGrouped(feed) as { humane, computer, entries }}
        <h2><time datetime={computer}>{humane}</time></h2>
        {#each entries as entry}
          <div class="discovery-link h-entry">
            <time datetime={entry.date} class="dt-published entry-timestamp">{humane}</time>
            <a class="provider-link p-author h-card" href={entry.author.url} rel="external">{entry.author.name}</a>
            {entry.verb || 'documented'}
            {#if entry.remoteURL}
              <a href={entry.remoteURL} class="entry-link p-name u-url" rel="external">{entry.title}</a>
              <!-- <a href={entry.cacheURL} class="permalink"><Icon name="link"/></a> -->
            {/if}
          </div>
        {/each}
      {/each}
    </div>
  {:else}
    <p>Feed data missing</p>
  {/if}
</MainBlock>

<style>
  a.icon-feed {
    display: block;
    width: 1em; height: 1em;
    float: right;
  }

  h2, div.discovery-link {
    font-size: 1em;
    margin: 0;
    padding: 0;
  }

  div.discovery-link {
    display: list-item;
    list-style-position: inside;
    list-style-type: square;
    padding-left: 0.5em;
  }

  time.entry-timestamp {
    display: none;
  }
</style>
