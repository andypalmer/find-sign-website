<script lang=ts>
  // import type { MediaItem } from './search/search-index'
  import type { SearchDataEncodedMedia } from '#lib/orthagonal/types.ts'
  import { getPageStore } from '#lib/functions/legacy-app-stores.ts'
  import { goto } from '$app/navigation'
  import { inview } from 'svelte-inview' // intersection observer
  import { browser } from '$app/env'

  const page = getPageStore()

  export let key: number|string = 0 // unique index of carousel, for search params state transmission
  export let medias: SearchDataEncodedMedia[] = []
  export let selected: number = parseInt($page.url.searchParams.get(`carousel${key}`) || '0')
  export let link = undefined
  export let prefer: 'performance' | 'quality' = 'performance'
  export let ssrPlayVideo = false

  $: media = medias[selected].encodes.sort((a, b) => {
    if (prefer === 'quality') {
      return b.byteSize - a.byteSize
    } else {
      return a.byteSize - b.byteSize
    }
  })

  let isInView = ssrPlayVideo

  function intersectionChange(event) {
    isInView = event.detail.inView
  }

  $: thumbnail = medias[selected].thumbnail
  // 'image' or 'video'
  $: type = media[0].type.split('/')[0]

  function buttonHref (base, selection: number): string {
    const params = new URLSearchParams(base)
    params.set(`carousel${key}`, `${selection}`)
    return `?${params}`
  }

  $: prevLink = (selected > 0) && buttonHref($page.url.searchParams, selected - 1)
  $: nextLink = (selected < medias.length - 1) && buttonHref($page.url.searchParams, selected + 1)

  function prevClick (event: MouseEvent) {
    event.preventDefault()
    selected -= 1
    /* @ts-ignore */
    const link: HTMLAnchorElement = event.target
    goto(link.href, { replace: true, reset: false })
  }

  function nextClick (event: MouseEvent) {
    event.preventDefault()
    selected += 1
    /* @ts-ignore */
    const link: HTMLAnchorElement = event.target
    goto(link.href, { replace: true, reset: false })
  }
</script>

<!-- svelte-ignore a11y-media-has-caption -->
<!-- these videos have no audio to caption -->
<div class={$$props.class} use:inview={{}} on:inview_change={intersectionChange} style={`--backdrop: url("${thumbnail}")`}>
  <a href={link} referrerpolicy="origin" rel="external" title="video {selected + 1}">
    {#key thumbnail || media}
      {#if type === 'video'}
        {#if !browser}
          <noscript>
            <video class="nojs" muted preload="auto" autoplay loop playsinline poster={thumbnail}>
              {#each media as source}<source src={source.url} type={source.type} data-width={`${source.width}`} data-height={`${source.height}`}>{/each}
            </video>
          </noscript>
        {/if}
        {#if isInView}
          <video muted preload="auto" autoplay loop playsinline poster={thumbnail}>
            {#each media as source}<source src={source.url} type={source.type} data-width={`${source.width}`} data-height={`${source.height}`}>{/each}
          </video>
        {:else}
          <img class="thumbnail" src={thumbnail} alt="video thumbnail">
        {/if}
      {:else if type === 'image'}
        <picture>
          {#each media as source}<source src={source.url} type={source.type}>{/each}
        </picture>
      {/if}
    {/key}
  </a>

  {#if prevLink}
    <a role="button" href={prevLink} class="prev" aria-label="Previous Video" on:click={prevClick}><span>❮</span></a>
  {/if}
  {#if nextLink}
    <a role="button" href={nextLink} class="next" aria-label="Next Video" on:click={nextClick}><span>❯</span></a>
  {/if}
</div>

<style>
  div {
    display: grid;
    grid-template-columns: 32px auto 32px;
    grid-template-rows: auto;
    /* background-color: var(--submodule-bg); */
    border-radius: 6px;
    width: 100%;
    aspect-ratio: 16 / 9;
    overflow: hidden;

    /* very fancy soon to be out of style custom 'neumorphic' style box */
    box-shadow:
      /* inset highlight and shadow */
      /* inset 0 -7rem 5em -2em hsla(var(--hue), calc(var(--module-bg-sat) - 5%), calc(var(--module-bg-lum) + 5%), var(--outer-highlight-alpha)), */
      /* inset 0 +7rem 5em -2em hsla(var(--hue), calc(var(--module-bg-sat) + 5%), calc(var(--module-bg-lum) - 3%), var(--outer-shadow-alpha)), */
      /* outside drop shadow */
      0.3rem 0.3rem 0.4rem hsla(var(--hue), calc(var(--module-bg-sat) + 5%), calc(var(--module-bg-lum) - 10%), var(--outer-shadow-alpha)),
      0.2rem 0.3rem 0.2rem hsla(var(--hue), calc(var(--module-bg-sat) + 5%), calc(var(--module-bg-lum) - 8%), var(--outer-shadow-alpha)),
      0.1rem 0.1rem 0.1rem hsla(var(--hue), calc(var(--module-bg-sat) + 5%), calc(var(--module-bg-lum) - 6%), var(--outer-shadow-alpha)),
      /* outside top highlight */
      -0.3rem -0.3rem 0.4rem hsla(var(--hue), calc(var(--module-bg-sat) - 5%), calc(var(--module-bg-lum) + 6%), var(--outer-highlight-alpha)),
      -0.2rem -0.2rem 0.2rem hsla(var(--hue), calc(var(--module-bg-sat) - 5%), calc(var(--module-bg-lum) + 4%), var(--outer-highlight-alpha)),
      -0.1rem -0.1rem 0.1rem hsla(var(--hue), calc(var(--module-bg-sat) - 5%), calc(var(--module-bg-lum) + 2%), var(--outer-highlight-alpha))
    ;

    /* backdrop effect */
    background-image: var(--backdrop);
    background-size: cover;
    background-position: center center;
    --background-filter: blur(7px) brightness(75%);
  }

  div > a[rel=external] {
    grid-row: 1;
    grid-column: 1 / 4;
    overflow: hidden;
    backdrop-filter: var(--background-filter);
    -webkit-backdrop-filter: var(--background-filter);
    border-radius: inherit;
  }

  video, picture {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 6px;
    z-index: 5;
    aspect-ratio: 16 / 9;
  }

  img.thumbnail {
    display: block;
    max-width: 100%;
    max-height: 100%;
    margin-left: auto;
    margin-right: auto;
  }

  a[role=button] {
    display: flex;
    grid-row: 1;
    z-index: 10;
    border: 0 none;
    padding: 0;
    font-size: 1em;
    font-weight: inherit;
    font-family: inherit;
    color: inherit;
    -webkit-backdrop-filter: brightness(80%) saturate(80%);
    backdrop-filter: brightness(80%) saturate(80%);
    align-items: center;
    justify-items: center;
    text-decoration: none;
  }

  a[role=button] span {
    text-align: center;
    flex-grow: 1;
  }

  a[role=button].prev {
    grid-column: 1;
    border-top-left-radius: 4px;
    border-bottom-left-radius: 4px;
  }

  a[role=button].next {
    grid-column: 3;
    border-top-right-radius: 4px;
    border-bottom-right-radius: 4px;
  }

  @media (prefers-color-scheme: light) {
    a[role=button] {
      -webkit-backdrop-filter: brightness(140%) saturate(60%);
      backdrop-filter: brightness(140%) saturate(60%);
    }
  }

  video.nojs::-webkit-media-controls {
    display: none;
  }
</style>
