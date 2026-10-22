// augments search-index with rank properties, and sorts by rank
import type { LoadedOrthagonalEntry } from '#lib/orthagonal/read.ts'
import type { SearchLibrary } from './search'
import { diversity as vectorDiversity } from '#lib/functions/vector-utilities.ts'
import type { RankingFilterFunction } from './text'
import { isNaughty } from './naughty'

// a naughty sign ranks after the signs that match a search as well, and before ones that match worse: more than
// most signs' spread of words adds (under 0.15 for nine in ten), less than most different words are apart (69 and
// 68 are 1.7), so 69 (sex) comes after 69 (number) but before 68
const naughtyPenalty = 0.25

export type RankedLibrary = {
  entries: LoadedOrthagonalEntry[]
}

export default function rank (library: SearchLibrary, filterFn: RankingFilterFunction): RankedLibrary {
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
        if (isNaughty(entry)) rankedEntry.rank += naughtyPenalty
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
