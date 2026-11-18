// the word vector library at the VECTOR_INDEX setting, opened once, with recent lookups remembered
import { vectorLibrary } from '@andypalmer/vectors'
import { VECTOR_INDEX } from '$app/env/public'
import { sayingWhichLibrary } from './vector-lookup-errors.ts'
import { checkedFetch } from '#lib/functions/checked-fetch.ts'

/** a word vector library at a given address, fetched with the given fetch. Asks the server every time, so a stored
 * bad answer can't outlive the fix (see checked-fetch.ts) */
export function openVectorLookup (url: string, fetchFile: typeof globalThis.fetch) {
  const library = vectorLibrary(url, { fetch: (input, init) => checkedFetch(fetchFile)(input, init) })
  return { preload: library.preload, lookup: sayingWhichLibrary(url, library.lookup) }
}

// the browser's and the default lookup: the word vector library at VECTOR_INDEX. The global fetch is read at each
// request, not now, so it can be replaced, as tests do
const defaultLookup = openVectorLookup(VECTOR_INDEX, (input, init) => globalThis.fetch(input, init))
export const preload = defaultLookup.preload
export const lookup = defaultLookup.lookup
