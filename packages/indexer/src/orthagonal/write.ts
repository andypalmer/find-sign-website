import { build as buildVectorShard } from '@find-sign/core/search/precomputed-vectors.ts'
import type { OrthagonalColumns, EncodedSearchData, EncodedSearchDataEntry, OrthagonalIndex } from '@find-sign/core/orthagonal/types.ts'
import normalizeWord from '@find-sign/core/orthagonal/normalize-word.ts'
import { chunk, times } from '@find-sign/core/functions/iters.ts'
import { nanoid } from 'nanoid'
import type { Vector } from '@find-sign/core/functions/vector-utilities.ts'

/** read an encoded-search-data from a url, transforming all URLs to be absolute */
export async function readEncodedSearchData (url: string): Promise<EncodedSearchData> {
  const response = await fetch(url)
  const json: EncodedSearchData = await response.json()
  for (const id in json) {
    const entry = json[id] = {
      id: id,
      published: true,
      // search-data files don't usually include the id, it's the key
      ...(json[id] as Partial<EncodedSearchDataEntry>)
    } as EncodedSearchDataEntry
    if (!entry.title && entry.words) {
      entry.title = entry.words.join(', ')
    }
    if (!entry.title) {
      entry.title = id
    }
    if (!entry.words) {
      /** @ts-ignore */
      const seg = new Intl.Segmenter(import.meta.env.VITE_LOCALE, { granularity: 'word' }) // node 16.x
      entry.words = [...seg.segment(entry.title)].filter(x => x.isWordLike).map(x => x.segment)
    }
    if (!entry.body) {
      entry.body = ''
    }
    if (!entry.tags) {
      entry.tags = []
    }
    if (!entry.media) {
      entry.media = []
    }
    // make all the links absolute
    if (entry.link) entry.link = (new URL(entry.link, url)).toString()
    if (entry.nav) entry.nav = entry.nav.map(([label, link]) => [label, (new URL(link, url)).toString()])
    if (entry.author && entry.author.link) {
      entry.author.link = (new URL(entry.author.link, url)).toString()
    }
    if (entry.author && entry.author.avatar) {
      entry.author.avatar = (new URL(entry.author.avatar, url)).toString()
    }
    if (entry.provider && entry.provider.link) {
      entry.provider.link = (new URL(entry.provider.link, url)).toString()
    }
    for (const mediaItem of entry.media) {
      mediaItem.thumbnail = (new URL(mediaItem.thumbnail, url)).toString()
      for (const encode of mediaItem.encodes) {
        encode.url = (new URL(encode.url, url)).toString()
      }
    }
  }
  return json
}

export type WriteIndexOptions = {
  lookupVector: (word: string) => Promise<Vector | undefined>,
  log?: (...things: any[]) => void,
  progress?: (value: number) => void,
}

export async function writeIndex (searchData: EncodedSearchData, { lookupVector, log = undefined, progress = undefined }: WriteIndexOptions) {
  const exportedColumns: OrthagonalColumns = {
    id: { type: 'string', path: 'id.json' },
    title: { type: 'string', path: 'title.json' },
    words: { type: 'string[]', isVectorIndexed: true, path: 'words.json' },
    link: { type: 'string', path: 'link.json' },
    tags: { type: 'string[]', path: 'tags.json' },
    author: { type: 'object', path: 'author.json' },
    timestamp: { type: 'number', path: 'timestamp.json' }
  }

  // contents of the meta.json
  const indexFile: OrthagonalIndex = {
    buildTimestamp: Date.now(),
    buildID: nanoid(),
    entriesPerShard: 8,
    entries: Object.keys(searchData).length,
    vectorCachePath: 'vectors.lps',
    columns: exportedColumns
  }

  // setup empty arrays for the exports
  const exportDatas: { [columnName: string]: { buildID: string, entries: any[] } } = Object.fromEntries(Object.keys(exportedColumns).map(columnName => [columnName, {
    buildID: indexFile.buildID,
    entries: []
  }]))

  if (progress) progress(0.01)
  if (log) log('Building metadata...')

  const outputFiles: { [path: string]: string | Uint8Array } = { 'meta.json': JSON.stringify(indexFile) }

  if (progress) progress(0.02)
  if (log) log('Building shards and orthagonal views...')

  // build the shards and indexes
  chunk(Object.keys(searchData), indexFile.entriesPerShard).forEach((entryIDs, shardNum) => {
    if (log) log(`Building shard-${shardNum}.json`)
    outputFiles[`shard-${shardNum}.json`] = JSON.stringify({
      buildID: indexFile.buildID,
      entries: entryIDs.map(id => {
        const output: { [key: string]: any } = { id, ...(searchData[id] as Partial<EncodedSearchDataEntry>) }
        for (const key in exportedColumns) {
          const value = output[key]
          exportDatas[key].entries.push(value === undefined ? null : value)
        }
        return output
      })
    })
    if (progress) progress(0.02 + (0.07) * (shardNum / (indexFile.entries / indexFile.entriesPerShard)))
  })

  if (progress) progress(0.09)
  if (log) log('Collecting every unique word from search-data...')

  const uniqueWords: Set<string> = new Set()
  // add word vectors to cache index
  for (const id in searchData) {
    const { words } = searchData[id]
    for (const word of words) uniqueWords.add(normalizeWord(word))
  }

  if (progress) progress(0.10)
  if (log) log(`${uniqueWords.size} unique words found`)
  if (log) log('Beginning looking up word vectors, building vector cache')

  const wordsQueue = [...uniqueWords]
  let wordsLookedUp = 0
  const vectorIndex: { [word: string]: Vector } = {}
  await Promise.all([...times(3, async () => {
    while (wordsQueue.length) {
      const word = wordsQueue.shift() as string
      const vector = await lookupVector(word)
      if (vector) vectorIndex[word] = vector
      wordsLookedUp += 1
      if (progress) progress(0.10 + ((wordsLookedUp / uniqueWords.size) * 0.87))
    }
  })])

  if (progress) progress(0.98)
  if (log) log('Serializing word vector cache...')

  // export vector cache
  outputFiles['vectors.lps'] = buildVectorShard(vectorIndex)

  if (progress) progress(0.99)
  if (log) log('Serializing orthagonal json’s...')

  for (const key in exportDatas) {
    outputFiles[exportedColumns[key].path] = JSON.stringify(exportDatas[key])
  }

  if (progress) progress(1.0)
  if (log) log('Search Index data prepared')

  return outputFiles
}
