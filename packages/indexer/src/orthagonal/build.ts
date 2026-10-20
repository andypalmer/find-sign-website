// provides the high level logic of building a search index, including global-vectors generation
// used by the admin index rebuild command, and the /automation/build-index/[index] endpoint
import { readEncodedSearchData, writeIndex } from './write'
import { lookup } from '@find-sign/core/search/loaded-precomputed-vectors.ts'
import { bulkWrite, readFile, writeFile } from '@find-sign/data-io/data-io.ts'
import { build, parse, type WordVector } from '@find-sign/core/search/precomputed-vectors.ts'
import { fn } from '@find-sign/core/models/filename-codec.ts'
import { getOverrideFor, listOverrides } from '#lib/models/index-override.ts'
import relativeURL from '#lib/functions/relative-url.ts'
import { updateRecordFile } from '#lib/records/encoded-search-data.ts'
import { dataServerRecordStore, type RecordStore } from '#lib/records/record-store.ts'
import type { EncodedSearchData } from '@find-sign/core/orthagonal/types.ts'
import { SEARCH_DATA, SEARCH_INDEX_NAME, SEARCH_INDEXES } from '$app/env/public'
import { ENCODED_SEARCH_DATAS, LOCALE, VECTOR_FIDELITY } from '$app/env/private'

const IndexName = SEARCH_INDEX_NAME

/**
 * provider name is required, log and progress options are functions called with updates
 * and 'fast' option, if truthy, will cause build to attempt to reuse vectors from existing
 * vector cache established in previous build, if possible, to make rebuilding really fast.
 *
 * Fast build should not be enabled if there's a chance the vector library was updated since
 * last build.
 *
 * Each build also updates the provider's record file (records/<provider>.records.json, unless another `records`
 * store is given), which keeps each sign's readable id from build to build. The index uses those ids, with old
 * permalinks as aliases.
 */
export default async function buildSearchIndex (provider: string, opts: { log?: (...things: any[]) => void, progress?: (n: number) => void, fast?: boolean, records?: RecordStore } = {}) {
  const log = opts.log || ((...str) => console.log(...str))
  const progress = opts.progress || (() => {})
  const records = opts.records || dataServerRecordStore(SEARCH_DATA)

  log(`Reading search data ${provider}...`)
  const encodedURL = `${ENCODED_SEARCH_DATAS}/${provider}.json`
  const allData = await readEncodedSearchData(encodedURL)
  progress(0.01)

  // unpublished entries aren't indexed, but stay in the records, so their ids stay reserved
  const published = Object.keys(allData).filter(key => allData[key].published !== false)

  log(`Reading overrides...`)
  // overrides apply only to published entries, so an override can't republish one
  const overridesList = (await listOverrides()).filter(x => x.provider === provider && published.includes(x.id))
  log(`Loading ${overridesList.length} override files...`)
  let overrideNum = 0
  for (const { id } of overridesList) {
    const override = await getOverrideFor(provider, id)
    allData[id] = {
      ...allData[id],
      ...override
    }
    overrideNum += 1
    progress(0.01 + (0.04 * (overrideNum / overridesList.length)))
  }

  log(`Updating records...`)
  const recordsURL = records.url(provider)
  const { file, changes } = await updateRecordFile(await records.read(provider), allData, {
    provider,
    seenAt: new Date().toISOString(),
    locale: LOCALE,
    // stored relative to the record file. Media sources are still relative to the encoded-search-data file
    url: url => relativeURL(recordsURL, new URL(url, encodedURL).toString()),
    onQuirk: ({ id, message }) => log(`  ${id}: ${message}`),
  })
  await records.write(file)
  if (changes) {
    log(`Records: ${Object.entries(changes).filter(([, ids]) => ids.length).map(([change, ids]) => `${ids.length} ${change}`).join(', ') || 'none'}`)
  } else {
    log(`Records: created for ${file.records.length} signs`)
  }

  // index published entries at their readable ids
  const bySourceId = new Map(file.records.map(record => [record.sourceId, record]))
  const searchData: EncodedSearchData = {}
  for (const key of published) {
    const record = bySourceId.get(key)!
    searchData[record.id] = { ...allData[key], id: record.id, sourceId: key, aliases: record.aliases }
  }

  // store media urls relative to the index folder, so the index works from whatever host serves it
  // read.ts loadEntry() resolves them back to absolute urls
  const indexFolderURL = `${SEARCH_DATA}${fn`${IndexName}/${provider}`}/`
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
  const vectorFiles = await Promise.all(SEARCH_INDEXES.split(',').map(async (provider: string) => {
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
  await writeFile(fn`${IndexName}/global-vectors.lps`, build(globalVectors, parseFloat(VECTOR_FIDELITY || '1.0')))
  progress(1.00)
  log('Build complete')
}
