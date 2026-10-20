import { availableIndexes } from '@find-sign/core/search/search.ts'

export async function load () {
  return { indexes: availableIndexes }
}
