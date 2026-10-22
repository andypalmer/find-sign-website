// the word vector library at the VECTOR_INDEX setting, opened once, with recent lookups remembered
import { vectorLibrary } from '@andypalmer/vectors'
import { VECTOR_INDEX } from '$app/env/public'

const library = vectorLibrary(VECTOR_INDEX)

export const preload = library.preload
export const lookup = library.lookup
