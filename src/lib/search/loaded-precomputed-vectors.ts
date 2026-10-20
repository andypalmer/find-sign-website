import type { VectorLibrary, WordVector } from '#lib/search/precomputed-vectors.ts'
import { open as pvOpen, lookup as pvLookup } from '#lib/search/precomputed-vectors.ts'
import lru from '#lib/functions/lru.ts'

let vectorLibrary: VectorLibrary = undefined
export async function preload (): Promise<VectorLibrary> {
  if (!vectorLibrary) {
    vectorLibrary = await pvOpen(import.meta.env.VITE_VECTOR_INDEX)
  }

  return vectorLibrary
}

const cacheSize = 250
const lookupCache = lru(cacheSize)
// const lookupCache: {string: string, vector: WordVector}[] = []
// proxy to precomputed-vectors.lookup, but caches the most recently used 250 queries in memory
export async function lookup (word: string): Promise<WordVector> {
  return await lookupCache(word, async (word) =>
    pvLookup(vectorLibrary || await preload(), word)
  )
}
