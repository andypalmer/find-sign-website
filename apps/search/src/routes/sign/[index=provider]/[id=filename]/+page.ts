import { error, redirect } from '@sveltejs/kit';
import { getSearchLibrary, type SearchLibrary } from '@find-sign/core/search/search.ts'
import { decodeFilename, fn } from '@find-sign/core/models/filename-codec.ts'
import { availableIndexes } from '@find-sign/core/search/search.ts'
import { OutdatedError } from '@find-sign/core/orthagonal/read.ts'

// an old permalink redirects to the sign's readable address, whose load needs the same index columns: they're
// handed over, used once, so the redirect doesn't fetch them again. Kept only briefly, in case the redirect
// isn't followed
const handOverFor = 10_000
let handedOver: { index: string, library: SearchLibrary, until: number } | undefined

function takeHandedOver (index: string): SearchLibrary | undefined {
  const ready = handedOver
  handedOver = undefined
  return ready?.index === index && Date.now() < ready.until ? ready.library : undefined
}

// indexes built before readable ids have no aliases column, and then every id is the original one
const freshIds = (index: string) => getSearchLibrary([index], ['id', 'aliases'])

async function signPage (index: string, id: string, url: URL, library: SearchLibrary) {
  const entries = library[index].entries
  const entry = entries.find(x => x.id === id)
  if (entry) {
    const result = await entry.load()
    return { result }
  }
  // an old permalink: send it on to the sign's readable address
  const renamed = entries.find(x => x.aliases?.includes(id))
  if (renamed) {
    handedOver = { index, library, until: Date.now() + handOverFor }
    redirect(308, fn`/sign/${index}/${renamed.id}` + url.search)
  }
  throw error(404);
}

export async function load ({ params, url }) {
  const index = decodeFilename(params.index)
  const id = decodeFilename(params.id)
  if (!availableIndexes.includes(index)) throw error(404);
  const handed = takeHandedOver(index)
  if (handed) {
    try {
      return await signPage(index, id, url, handed)
    } catch (err) {
      // the index was rebuilt since: look again
      if (!(err instanceof OutdatedError)) throw err
    }
  }
  return await signPage(index, id, url, await freshIds(index))
}
