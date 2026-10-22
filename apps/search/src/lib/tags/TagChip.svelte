<script lang="ts">
  // A tag that explains itself: hovering or focusing it shows what it means, and clicking searches for it. On a
  // touch screen the first tap explains it instead, with the search as a link in the explanation.
  import type { ShownTag } from './tag-groups.ts'

  export let tag: ShownTag
  export let warning = false
  /** the result's key, keeping the explanation's id apart from other results' */
  export let key = 0

  let chip: HTMLElement
  let open = false
  let touched = false
  // a tap focuses the link, which opens the explanation too, so whether a tap has explained it is kept apart
  let tapped = false
  let place = { left: 0, top: 0, below: true }

  $: href = `/search?${new URLSearchParams({ query: `#${tag.id}`, page: '0' })}`
  $: tipId = `tag-${key}-${tag.id}`

  // the result card clips what overflows it, so the explanation is placed against the window instead
  function show () {
    const rect = chip.getBoundingClientRect()
    const below = rect.bottom + 120 < window.innerHeight
    place = { left: Math.max(8, Math.min(rect.left, window.innerWidth - 288)), top: below ? rect.bottom + 6 : rect.top - 6, below }
    open = true
  }
  const hide = () => { open = false; touched = false; tapped = false }

  function click (event: MouseEvent) {
    if (!touched || tapped) return
    event.preventDefault()
    show()
    tapped = true
  }

  function outside (event: PointerEvent) {
    if (open && !chip.contains(event.target as Node)) hide()
  }
</script>

<svelte:window on:pointerdown={outside} on:keydown={event => event.key === 'Escape' && hide()} on:scroll={() => touched || hide()}/>

<span class="chip" class:warning bind:this={chip}>
  <a {href} rel="nofollow" aria-describedby={tipId}
    on:pointerdown={event => { touched = event.pointerType === 'touch' }}
    on:pointerenter={event => event.pointerType === 'mouse' && show()}
    on:pointerleave={event => event.pointerType === 'mouse' && hide()}
    on:focus={show} on:blur={() => touched || hide()}
    on:click={click}>{tag.label}</a>
  <span class="tip" class:open class:above={!place.below} id={tipId} role="tooltip" style:left="{place.left}px" style:top="{place.top}px">
    {#if tag.meaning}<span class="meaning">{tag.meaning}</span>{/if}
    <span class="about">{tag.from ? `From ${tag.from} · ` : ''}#{tag.id}</span>
    {#if touched}<a class="search" {href} rel="nofollow">Search #{tag.id}</a>{/if}
  </span>
</span>

<style>
  .chip { display: inline-block; }
  .chip > a {
    display: inline-block;
    padding: 0 0.7ex;
    border-radius: 0.8em;
    border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
    color: inherit;
    text-decoration: none;
    line-height: 1.5;
  }
  .chip > a:hover, .chip > a:focus-visible { border-color: currentColor; }
  .chip.warning > a {
    border-color: var(--alert-border, #c0392b);
    background: color-mix(in srgb, var(--alert-border, #c0392b) 12%, transparent);
  }

  .tip {
    display: none;
    position: fixed;
    z-index: 100;
    max-width: 280px;
    padding: 0.6em 0.8em;
    border-radius: 8px;
    background: var(--module-bg, white);
    color: inherit;
    box-shadow: 0 2px 12px rgb(0 0 0 / 25%);
    font-size: 0.9rem;
    white-space: normal;
    line-height: 1.4;
  }
  .tip.open { display: grid; gap: 0.3em; }
  .tip.above { transform: translateY(-100%); }
  .tip .about { opacity: 0.6; font-size: 85%; }
  .tip .search { text-decoration: underline; color: inherit; }
</style>
