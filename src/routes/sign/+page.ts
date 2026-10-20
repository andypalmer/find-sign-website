import { availableIndexes } from '#lib/search/search.ts'

export async function load () {
  return { indexes: availableIndexes }
}
