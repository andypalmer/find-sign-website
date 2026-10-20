import { decodeFilename } from '@find-sign/core/models/filename-codec.ts'
import { getSearchLibrary, availableIndexes } from '@find-sign/core/search/search.ts'
import { error } from '@sveltejs/kit'

export async function load ({ params }) {
  const index = decodeFilename(params.index)
  if (!availableIndexes.includes(index)) error(404)
  const library = await getSearchLibrary([index], ['id', 'title'], true)

  const results = library[index].entries

  return { index, results }
}
