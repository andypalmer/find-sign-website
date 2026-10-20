<script lang="ts">
  import watchMedia from '$lib/functions/media-store'
  import { createEventDispatcher, onMount } from 'svelte'
  import { browser } from '$app/environment'
  import { goto } from '$app/navigation'
  import { slide } from 'svelte/transition'
  import { quintOut } from 'svelte/easing'
  import { navigating } from '$app/stores'

  import Icon from '$lib/Icon.svelte'
  import MiniSpinner from '$lib/MiniSpinner.svelte'
  import RegionMap from '$lib/RegionMap.svelte'
  import regionStore from '$lib/models/region-store'
  import MiniBlock from '$lib/MiniBlock.svelte'

  export let formAction = '/search'
  export let method: 'GET' | 'POST' = 'GET'
  export let queryHandler = undefined
  export let query = ''
  export let input = undefined
  let formElement
  let showAdvanced = false

  const fire = createEventDispatcher()

  const media = watchMedia({ phone: '(max-width: 600px)' })

  // is the page load towards a search results page?
	$: isSearchLoad = $navigating && $navigating.to && $navigating.to.url.pathname === '/search'

  onMount(() => {
    if (queryHandler === undefined) {
      queryHandler = localNavHandler
    }
  })

  function localNavHandler () {
    const formData = (new FormData(formElement))
    const url = new URL(formAction, window.location.href)
    formData.forEach((value, key) => url.searchParams.set(key, `${value}`))
    goto(url.href)
  }

  function onSearch (event) {
    if (queryHandler) {
      event.preventDefault()
      queryHandler(query)
    }
  }
</script>

<form class={$$props.class} style={$$props.style} bind:this={formElement} role=search autocomplete=off action={formAction} {method} on:submit={onSearch}>
  <div class="left-icon" on:click={() => input.focus()}>
    {#if !isSearchLoad}
      <Icon name=search/>
    {:else}
      <MiniSpinner speed="0.5s" />
    {/if}
  </div>
  <input bind:this={input} autocomplete=off autocapitalize=none aria-label="Enter search query here." name=query bind:value={query}>
  <div class="right-icon" on:click={() => showAdvanced = !showAdvanced}>
    <RegionMap class="map"
      tags={$regionStore ? [$regionStore] : ['wa', 'nt', 'sa', 'qld', 'nsw', 'vic', 'tas']}
    />
  </div>
  <input type=hidden name=page value=0>
  <input type=hidden name=vp value={$media.phone ? 'm' : 'd'}>
  {#if $regionStore}
    <input type=hidden name=r value={$regionStore}/>
  {/if}
</form>

{#if showAdvanced}
  <div class="advanced" transition:slide|global={{ duration: 300 }}>
    <MiniBlock>
      <h1>Advanced Settings</h1>
      {#if $regionStore}
        Only show results from {`${$regionStore}`.toUpperCase()} region
      {:else}
        Show results from everywhere
      {/if}
      <RegionMap
        tags={$regionStore ? [$regionStore] : ['wa', 'nt', 'sa', 'qld', 'nsw', 'vic', 'tas']}
        editable
        on:click={(e) => {
          if ($regionStore === e.detail.region) {
            $regionStore = false
          } else {
            $regionStore = e.detail.region
          }
          fire('regionChange', { region: $regionStore })
        }}
        />
    </MiniBlock>
  </div>
{/if}

<style>
  form {
    --square: calc(3.6rem - 6px);
    display: grid;
    grid-template-columns: var(--square) auto var(--square);
    grid-template-rows: var(--square);
    grid-auto-columns: var(--square);
    align-items: center;
    justify-items: center;

    font-size: 1.6em;
    margin: 0 auto 0 auto;

    border-radius: 1.8rem;
    background-image: var(--noise-texture);
    background-color: var(--module-bg);
    background-blend-mode: multiply;
    border: 3px solid var(--module-bg);
    /* very fancy soon to be out of style custom 'neumorphic' style box */
    box-shadow:
      /* inset shadow */
      inset 0.35rem 0.3rem 0.6rem -0.3rem hsla(var(--hue), calc(var(--module-bg-sat) + 4%), calc(var(--module-bg-lum) - 8%), 100%),
      inset 0.30rem 0.4rem 0.7rem -0.3rem hsla(var(--hue), calc(var(--module-bg-sat) + 4%), calc(var(--module-bg-lum) - 8%), 100%),
      inset 0.25rem 0.5rem 0.8rem -0.3rem hsla(var(--hue), calc(var(--module-bg-sat) + 4%), calc(var(--module-bg-lum) - 8%), 100%),
      inset 0.05rem 10rem  10rem   0rem   hsla(var(--hue), calc(var(--module-bg-sat) + 4%), calc(var(--module-bg-lum) - 8%), var(--outer-shadow-alpha)),
      /* inset highlight */
      inset -0.35rem -0.3rem 0.6rem -0.3rem hsla(var(--hue), calc(var(--module-bg-sat) - 2%), calc(var(--module-bg-lum) + 4%), 100%),
      inset -0.30rem -0.4rem 0.7rem -0.3rem hsla(var(--hue), calc(var(--module-bg-sat) - 2%), calc(var(--module-bg-lum) + 4%), 100%),
      inset -0.25rem -0.5rem 0.8rem -0.3rem hsla(var(--hue), calc(var(--module-bg-sat) - 2%), calc(var(--module-bg-lum) + 4%), 100%),
      inset -0.05rem -10rem  10rem   0rem   hsla(var(--hue), calc(var(--module-bg-sat) - 2%), calc(var(--module-bg-lum) + 4%), var(--outer-highlight-alpha)),
      /* outside drop shadow */
      0.3rem 0.6rem 0.8rem hsla(var(--hue), calc(var(--base-bg-sat) + 5%), calc(var(--base-bg-lum) - 6%), var(--outer-shadow-alpha)),
      0.3rem 0.5rem 1.0rem hsla(var(--hue), calc(var(--base-bg-sat) + 5%), calc(var(--base-bg-lum) - 4%), var(--outer-shadow-alpha)),
      0.3rem 0.4rem 1.2rem hsla(var(--hue), calc(var(--base-bg-sat) + 5%), calc(var(--base-bg-lum) - 2%), var(--outer-shadow-alpha)),
      /* outside top highlight */
      -0.3rem -0.6rem 0.8rem hsla(var(--hue), calc(var(--base-bg-sat) - 5%), calc(var(--base-bg-lum) + 6%), var(--outer-highlight-alpha)),
      -0.3rem -0.5rem 1.0rem hsla(var(--hue), calc(var(--base-bg-sat) - 5%), calc(var(--base-bg-lum) + 4%), var(--outer-highlight-alpha)),
      -0.3rem -0.4rem 1.2rem hsla(var(--hue), calc(var(--base-bg-sat) - 5%), calc(var(--base-bg-lum) + 2%), var(--outer-highlight-alpha))
    ;
  }

  /* magnifing glass symbol in search form */
  form > div.left-icon {
    display: block;
    width: 1em;
    height: 1em;
    grid-column: 1;
  }

  input {
    display: block;
    grid-column: 2;
    font-family: inherit;
    font-size: inherit;
    caret-color: var(--base-fg);
    background-color: transparent;
    color: inherit;
    border: 0 none;
    outline: 0 none;
    width: 100%;
    height: 100%;
  }

  form > .right-icon {
    display: block;
    width: 1em;
    height: 1em;
    grid-column: 3;
    cursor: pointer;
  }

</style>