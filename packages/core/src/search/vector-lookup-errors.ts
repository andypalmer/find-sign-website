// A failed fetch in the browser says only "Failed to fetch", which doesn't say what it was trying to fetch. When a
// word's vector can't be looked up, this makes the error say which word vector library was being asked.
import type { WordVector } from '#lib/search/precomputed-vectors.ts'

export type LookUpAWordVector = (word: string) => Promise<WordVector | undefined>

export function sayingWhichLibrary (libraryAddress: string, lookup: LookUpAWordVector): LookUpAWordVector {
  return async word => {
    try {
      return await lookup(word)
    } catch (error) {
      throw new Error(`${libraryAddress}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
    }
  }
}
