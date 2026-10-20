import { error, redirect } from '@sveltejs/kit';
import { getSearchLibrary } from '@find-sign/core/search/search.ts'
import { decodeFilename, fn } from '@find-sign/core/models/filename-codec.ts'
import { availableIndexes } from '@find-sign/core/search/search.ts'

export async function load ({ params, url }) {
  const index = decodeFilename(params.index)
  const id = decodeFilename(params.id)
  if (availableIndexes.includes(index)) {
    // indexes built before readable ids have no aliases column, and then every id is the original one
    const library = await getSearchLibrary([index], ['id', 'aliases'])
    const entries = library[index].entries
    const entry = entries.find(x => x.id === id)
    if (entry) {
      const result = await entry.load()
      return { result }
    }
    // an old permalink: send it on to the sign's readable address
    const renamed = entries.find(x => x.aliases?.includes(id))
    if (renamed) redirect(308, fn`/sign/${index}/${renamed.id}` + url.search)
  }
  throw error(404);
}
