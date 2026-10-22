<script lang="ts">
  import { isEncodedSearchDataEntry, type EncodedSearchDataEntry } from '@find-sign/core/orthagonal/types.ts'
  import watchMedia from '#lib/functions/media-store.ts'
  import Carousel from '#lib/result/Carousel.svelte'
  import RegionMap from '#lib/RegionMap.svelte'
  import Icon from '@find-sign/core/ui/Icon.svelte'
  import TagList from '#lib/tags/TagList.svelte'

  export let data: EncodedSearchDataEntry
  export let expand = false
  export let permalink: string | undefined = undefined
  export let carouselSelected: number | undefined = undefined
  export let key: number = 0
  export let prefer: 'performance' | 'quality' = 'performance'
  export let ssrPlayVideo = false
  /** every tag, grouped and explained, as on the sign's own page; otherwise its warnings and first few */
  export let allTags = false

  $: warnings = data ? [...getWarnings(data.tags)] : []

  $: isCorrupt = !isEncodedSearchDataEntry(data)

  const media = watchMedia({ phone: '(max-width: 600px)' })
  $: implicitExpand = expand || $media.phone

  const phraseSearch = (phrase: string) => `/search?${new URLSearchParams({ query: phrase, page: '0' })}`

  function * getWarnings (tags: string[]) {
    if (tags.includes('invented'))
      yield { text: 'Informal, colloqual sign. Professionals should not use.', type: '', icon: 'alert' }
  }
</script>

<div class={$$props.class} class:result={true} class:placeholder={!data || isCorrupt} class:expand={implicitExpand}>
  {#if isCorrupt}
    <p>An error exists in <a href={permalink}>{permalink}</a>, search result could not be shown</p>
  {/if}
  {#if data && !isCorrupt}
    <Carousel
      bind:selected={carouselSelected}
      medias={data.media}
      {key}
      link={data.link ? data.link : permalink}
      {ssrPlayVideo}
      {prefer}
      class="carousel" />

    <div class=heading>
      <div class=datas>
        <h2 class=words>
          {#if data.link}
            <a href={data.link} referrerpolicy=origin rel=external data-sveltekit-reload>
              {data.title || data.words.join(', ')}
            </a>
          {:else if permalink}
            <a href={permalink}>{data.title || data.words.join(', ')}</a>
          {:else}
            {data.title || data.words.join(', ')}
          {/if}
        </h2>

        <cite class=link>
          {#if data.nav && data.nav.length > 0}
            {#each data.nav as [name, url]}
              <a href={url} referrerpolicy=origin rel=external data-sveltekit-reload>{name}</a>
            {/each}
          {:else if data.link}
            <a href={data.link} referrerpolicy=origin rel=external data-sveltekit-reload>{data.link}</a>
          {:else if permalink}
            <a href={permalink}>{permalink}</a>
          {/if}
        </cite>

        {#if data.tags || data.author}
          <div class=tags>
            {#if data.author && data.author.id}@{data.author.id} {/if}
            {#if data.tags && !allTags}<TagList tags={data.tags} provider={data.provider} {permalink} {key}/>{/if}
          </div>
        {/if}
      </div>

      <div class=icons>
        {#if permalink}
          <a class="permalink" href={permalink} data-sveltekit-preload-data><Icon name="link"/></a>
        {/if}

        {#if ['wa','nt','sa','qld','nsw','act','vic','tas'].some(x => data.tags.includes(x))}
          <RegionMap tags={data.tags} class=map></RegionMap>
        {/if}
      </div>
    </div>

    <!-- kept on one line: .body preserves whitespace, so none may appear between these tags -->
    {#if allTags && (data.tags || data.englishPhrases?.length)}
      <div class=all-tags>
        {#if data.englishPhrases?.length}
          <p class=english>In English: {#each data.englishPhrases as phrase, index}{#if index > 0}{', '}{/if}<a href={phraseSearch(phrase)} rel=nofollow>{phrase}</a>{/each}</p>
        {/if}
        {#if data.tags}<TagList tags={data.tags} provider={data.provider} {key} full/>{/if}
      </div>
    {/if}

    <div class=body>{#if warnings.length > 0}<div class=alerts>{#each warnings as warning}<div class="alert {warning.type}"><Icon name={warning.icon || 'alert'}/> {warning.text}</div>{/each}</div>{/if}{data.body || ''}</div>
  {/if}
</div>

<style>
  .result {
    background-color: var(--module-bg);
    border-radius: 10px;
    margin-top: 1.1em;
    color: inherit;
    text-decoration: none;
    overflow: hidden;
    padding: 1ex;

    /* very fancy soon to be out of style custom 'neumorphic' style box */
    box-shadow:
    /* inset highlight and shadow */
    inset 0 -7rem 5em -2em hsla(var(--hue), calc(var(--module-bg-sat) - 5%), calc(var(--module-bg-lum) + 5%), var(--outer-highlight-alpha)),
    inset 0 +7rem 5em -2em hsla(var(--hue), calc(var(--module-bg-sat) + 5%), calc(var(--module-bg-lum) - 3%), var(--outer-shadow-alpha)),
    /* outside drop shadow */
    0.3rem 0.3rem 0.4rem hsla(var(--hue), calc(var(--base-bg-sat) + 5%), calc(var(--base-bg-lum) - 10%), var(--outer-shadow-alpha)),
    0.2rem 0.3rem 0.2rem hsla(var(--hue), calc(var(--base-bg-sat) + 5%), calc(var(--base-bg-lum) - 8%), var(--outer-shadow-alpha)),
    0.1rem 0.1rem 0.1rem hsla(var(--hue), calc(var(--base-bg-sat) + 5%), calc(var(--base-bg-lum) - 6%), var(--outer-shadow-alpha)),
    /* outside top highlight */
    -0.3rem -0.3rem 0.4rem hsla(var(--hue), calc(var(--base-bg-sat) - 5%), calc(var(--base-bg-lum) + 6%), var(--outer-highlight-alpha)),
    -0.2rem -0.2rem 0.2rem hsla(var(--hue), calc(var(--base-bg-sat) - 5%), calc(var(--base-bg-lum) + 4%), var(--outer-highlight-alpha)),
    -0.1rem -0.1rem 0.1rem hsla(var(--hue), calc(var(--base-bg-sat) - 5%), calc(var(--base-bg-lum) + 2%), var(--outer-highlight-alpha))
    ;
  }

  .words {
    line-height: 1em;
    margin: 0;
    grid-area: title;
    font-size: 1.3rem;
    font-weight: normal;
    text-transform: capitalize;
    text-overflow: ellipsis;
    white-space: nowrap;
    /* overflow-x: hidden; */
  }

  .words a {
    text-decoration: none;
    color: inherit;
  }

  .result :global(.map) {
    width: 2em;
    height: 2em;
    stroke-width: 5px;
  }

  .heading {
    grid-area: heading;
    display: grid;
    grid-template-columns: auto max-content;
    grid-template-areas: "datas icons";
  }

  .heading > .datas { grid-area: datas; overflow: hidden; }
  .heading > .datas * { text-overflow: ellipsis; }
  .heading > .icons {
    grid-area: icons;
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 2em;
    grid-template-rows: 2em;
    place-items: center;
  }
  /* .heading > .icons > * { width: 2em; height: 2em; } */
  .heading .permalink { text-align: center; opacity: 0.5 }
  .heading .permalink:hover { opacity: 1.0 }

  .link { grid-area: breadcrumbs; }
  .tags { grid-area: hashtags; }
  .alerts { grid-area: alerts; }
  .body { grid-area: body; }
  .all-tags { grid-area: alltags; margin: 0.6em 0; font-size: 90%; }
  .all-tags .english { margin: 0 0 0.6em; }
  .all-tags .english a { color: inherit; }

  .result:not(.expand) {
    display: grid;
    grid-template-columns: 256px 1ex auto;
    grid-template-rows: auto 1fr;
    height: 160px;
    grid-template-areas:
      "media gap heading"
      "media gap body";
  }

  .result.expand {
    display: grid;
    grid-template-columns: auto;
    grid-template-rows: auto 1ex auto auto auto;
    grid-template-areas:
      "media"
      "gap"
      "heading"
      "body"
      "alltags";
  }

  .result :global(.carousel) {
    grid-area: media;
  }

  .link, .tags {
    text-overflow: ellipsis;
    font-size: 80%;
    white-space: nowrap;
    overflow: hidden;
  }

  .link a {
    text-decoration: underline;
    font-style: normal;
    color: inherit;
  }

  /* add forward slashes to nav breadcrumb type links */
  .link a:not(:first-child):before {
    content: "/";
    padding-left: 0.7ex;
    padding-right: 0.7ex;
    display: inline-block; /* removes underline */
  }

  .body {
    --line-height: 1.4em;
    --visible-lines: 4.65;
    text-overflow: ellipsis;
    white-space: pre-line;
    overflow: hidden;
    line-height: var(--line-height);
    font-size: 0.95em;
    max-height: calc(var(--line-height) * var(--visible-lines) - 1rem);
  }

  .result.expand .body {
    max-height: unset;
  }

  /* alert notices on search results */
  .result.invented { background-color: var(--alert-bg); }
  .result .alert :global(svg) {
    vertical-align: -0.2ex;
  }
</style>
