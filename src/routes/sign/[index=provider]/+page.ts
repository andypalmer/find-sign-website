import { decodeFilename } from '#lib/models/filename-codec.ts'
import { getSearchLibrary } from '#lib/search/search.ts'

export async function load ({ params }) {
  const index = decodeFilename(params.index)
  const library = await getSearchLibrary([index], ['id', 'title'], true)

  const results = library[index].entries

  return { index, results }
}
