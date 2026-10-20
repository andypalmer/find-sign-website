// augments search-index with rank properties, and sorts by rank
import type { LoadedOrthagonalEntry } from '#lib/orthagonal/read.ts'
import type { SearchLibrary } from './search'
import { diversity as vectorDiversity } from '#lib/functions/vector-utilities.ts'

export type RankedLibrary = {
  entries: LoadedOrthagonalEntry[]
}

export default function rank (library: SearchLibrary, filterFn): RankedLibrary {
  const entries = Object.values(library).flatMap(index => {
    return index.entries.flatMap(entry => {
      const rank = filterFn(entry)
      if (typeof rank === 'number' && rank < Infinity) {
        const rankedEntry = Object.create(entry)
        if (entry.vectors) {
          const diversity = Math.max(...vectorDiversity(...entry.vectors.filter(x => x instanceof Float32Array)))
          rankedEntry.rank = rank + (diversity * 0.1)
        } else {
          rankedEntry.rank = rank
        }
        return [rankedEntry]
      } else {
        return []
      }
    })
  }).sort((x, y) => {
    return x.rank - y.rank
  })

  return { entries }
}
