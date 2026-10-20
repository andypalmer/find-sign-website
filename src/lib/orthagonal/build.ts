// provides the high level logic of building a search index, including global-vectors generation
// used by the admin index rebuild command, and the /automation/build-index/[index] endpoint
import { readEncodedSearchData, writeIndex } from './write'
import { lookup } from '#lib/search/loaded-precomputed-vectors.ts'
import { bulkWrite, readFile, writeFile } from '#lib/data-io/data-io.ts'
import { build, parse, type WordVector } from '#lib/search/precomputed-vectors.ts'
import { fn } from '#lib/models/filename-codec.ts'
import { getOverrideFor, listOverrides } from '#lib/models/index-override.ts'
import relativeURL from '#lib/functions/relative-url.ts'

const IndexName = import.meta.env.VITE_SEARCH_INDEX_NAME

/**
 * provider name is required, log and progress options are functions called with updates
 * and 'fast' option, if truthy, will cause build to attempt to reuse vectors from existing
 * vector cache established in previous build, if possible, to make rebuilding really fast.
 *
 * Fast build should not be enabled if there's a chance the vector library was updated since
 * last build.
 */
export default async function buildSearchIndex (provider: string, opts: { log?: (...things: any[]) => void, progress?: (n: number) => void, fast?: boolean } = {}) {
  const log = opts.log || ((...str) => console.log(...str))
  const progress = opts.progress || (() => {})

  log(`Reading search data ${provider}...`)
  const searchData = await readEncodedSearchData(`${import.meta.env.VITE_ENCODED_SEARCH_DATAS}/${provider}.json`)
  progress(0.01)

  // remove unpublished entries
  for (const id in searchData) {
    if (searchData[id].published === false) {
      delete searchData[id]
    }
  }

  log(`Reading overrides...`)
  const overridesList = (await listOverrides()).filter(x => x.provider === provider && x.id in searchData)
  log(`Loading ${overridesList.length} override files...`)
  let overrideNum = 0
  for (const { id } of overridesList) {
    const override = await getOverrideFor(provider, id)
    searchData[id] = {
      ...searchData[id],
      ...override
    }
    overrideNum += 1
    progress(0.01 + (0.04 * (overrideNum / overridesList.length)))
  }

  // store media urls relative to the index folder, so the index works from whatever host serves it
  // read.ts loadEntry() resolves them back to absolute urls
  const indexFolderURL = `${import.meta.env.VITE_SEARCH_DATA}${fn`${IndexName}/${provider}`}/`
  for (const id in searchData) {
    for (const mediaItem of searchData[id].media) {
      mediaItem.thumbnail = relativeURL(indexFolderURL, mediaItem.thumbnail)
      for (const encode of mediaItem.encodes) {
        encode.url = relativeURL(indexFolderURL, encode.url)
      }
    }
  }

  let vectorCache: Map<string, WordVector>
  if (opts.fast) {
    log(`Reading previous build vector cache...`)
    const vectorCacheData = await readFile(fn`${IndexName}/${provider}/vectors.lps`)
    if (vectorCacheData) {
      vectorCache = new Map([...parse(vectorCacheData)].map(({ word, getVector }) => {
        return [word, getVector()]
      }))
    }
  }

  log(`Building orthagonal index in memory...`)
  const files = await writeIndex(searchData, {
    lookupVector: async word => {
      if (vectorCache && vectorCache.has(word)) return vectorCache.get(word)
      return await lookup(word)
    },
    log,
    progress: (num) => progress(0.05 + (num * 0.90))
  })

  log(`Search index files constructed, writing...`)
  progress(0.96)
  await bulkWrite(fn`${IndexName}/${provider}`, files)
  progress(0.97)
  log(`Rebuilding global word vector cache: Loading vector files...`)
  const vectorFiles = await Promise.all(import.meta.env.VITE_SEARCH_INDEXES.split(',').map(async (provider: string) => {
    const file = await readFile(fn`${IndexName}/${provider}/vectors.lps`)
    if (file) {
      return parse(file)
    } else {
      return undefined
    }
  }))
  progress(0.98)
  log(`Building global word vector cache...`)
  const globalVectors: { [word: string]: WordVector } = {}
  for (const vectors of vectorFiles) {
    if (vectors) { // only if the index existed and successfully loaded...
      for (const { word, getVector } of vectors) {
        if (!globalVectors[word]) globalVectors[word] = getVector()
      }
    }
  }
  progress(0.99)
  log(`Writing global word vector cache...`)
  await writeFile(fn`${IndexName}/global-vectors.lps`, build(globalVectors, parseFloat(import.meta.env.VITE_VECTOR_FIDELITY || '1.0')))
  progress(1.00)
  log('Build complete')
}
