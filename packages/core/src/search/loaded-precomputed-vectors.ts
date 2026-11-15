// the word vector library at the VECTOR_INDEX setting, opened once, with recent lookups remembered
import { vectorLibrary } from '@andypalmer/vectors'
import { VECTOR_INDEX } from '$app/env/public'
import { sayingWhichLibrary } from './vector-lookup-errors.ts'
import { checkedFetch } from '#lib/functions/checked-fetch.ts'

// asks the server every time, so a stored bad answer can't outlive the fix (see checked-fetch.ts)
// (the global fetch is read at each request, not now, so it can be replaced, as tests do)
const library = vectorLibrary(VECTOR_INDEX, { fetch: (input, init) => checkedFetch(globalThis.fetch)(input, init) })

export const preload = library.preload
export const lookup = sayingWhichLibrary(VECTOR_INDEX, library.lookup)
