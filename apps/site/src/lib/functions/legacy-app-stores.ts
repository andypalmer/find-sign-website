// SvelteKit 3 removed the $app/stores module in favour of $app/state (runes). Legacy mode components
// (export let, $:) only re-run `$:` statements when a store or local variable they reference changes,
// so they can't react to $app/state directly. These rebuild the parts of the old API this app uses on
// top of $app/state. $app/state can only be read during component setup on the server, so call these
// while a component initialises, e.g. `const page = getPageStore()`.
// Delete this once those components move to runes.
import { page as pageState, navigating as navigatingState } from '$app/state'
import { toStore, type Readable } from 'svelte/store'
import type { Navigation } from '$app/navigation'

/** like the old $app/stores page store; only `url` is provided */
export function getPageStore (): Readable<{ url: URL }> {
  return toStore(() => ({ url: pageState.url as URL }))
}

/** like the old $app/stores navigating store: null when no navigation is in progress */
export function getNavigatingStore (): Readable<Navigation | null> {
  return toStore(() => {
    if (navigatingState.type === null) return null
    return { from: navigatingState.from, to: navigatingState.to, type: navigatingState.type } as Navigation
  })
}
