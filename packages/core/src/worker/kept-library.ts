// Loads the version 2 index for the search engine, from the files the file keeper holds. The keeper does the
// fetching, the shelf and the manifest check; the version 2 reader (from the pipeline's orthagonal package) knows
// what the files mean; this puts the two together and hands the engine what it asked for.
import { IndexReader } from '@andypalmer/orthagonal'
import { parse as parseVectors } from '@andypalmer/vectors'
import normalizeWord from '#lib/orthagonal/normalize-word.ts'
import type { WordVector } from '#lib/search/precomputed-vectors.ts'
import type { SearchLibrary, SearchSeams } from '#lib/search/search-engine.ts'
import { FileUnavailable, type IHandOverIndexFiles } from './file-keeper.ts'
import { ManifestReader } from './manifest-reader.ts'

const manifestName = 'manifest.json'

/**
 * A `fetch` for the version 2 reader that gets its files from the file keeper. manifest.json is the keeper's
 * checked copy, and every other file is the keeper's kept copy, fetched once. A file the data server hasn't got
 * is a 404, and any other answer from it keeps its status; a network that can't be reached is a failure.
 */
export function fetchThroughTheKeeper (keeper: IHandOverIndexFiles, baseUrl: string): typeof fetch {
  const folder = `${baseUrl.replace(/\/+$/, '')}/`
  return async (input) => {
    const url = String(input instanceof Request ? input.url : input)
    if (!url.startsWith(folder)) throw new Error(`${url} is outside ${folder}, which is all the keeper looks after`)
    const name = url.slice(folder.length)
    try {
      const bytes = name === manifestName ? await keeper.manifest() : await keeper.fileNamed(name)
      return new Response(bytes as BodyInit)
    } catch (error) {
      if (error instanceof FileUnavailable) return new Response(error.message, { status: error.status })
      throw error
    }
  }
}

export type KeptLibraryOptions = {
  /** the data server folder the index files live in */
  baseUrl: string,
  /** the indexes to search, in the order we trust them: signs that rank equally go in that order */
  indexes: string[],
}

type Words = { [word: string]: WordVector }
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

/**
 * The librarian: loads every index to search from the kept files, and keeps what it loaded for as long as
 * manifest.json says it is still the newest, so a search costs one small check, not a load.
 */
export class KeptLibrary {
  private keeper: IHandOverIndexFiles
  private baseUrl: string
  private indexes: string[]
  private manifests = new ManifestReader()
  private loaded?: { manifestText: string, library: Promise<SearchLibrary>, vectorsAttached: boolean }
  private words?: { key: string, words: Promise<Words> }

  constructor (keeper: IHandOverIndexFiles, options: KeptLibraryOptions) {
    this.keeper = keeper
    this.baseUrl = options.baseUrl
    this.indexes = options.indexes
  }

  /** manifest.json as the keeper holds it right now: the search reads it once, through here */
  manifest (): Promise<Uint8Array> {
    return this.keeper.manifest()
  }

  /** every word the signs use, with its vector: the shared vector files, fetched once and kept while they are current */
  async knownVectors (): Promise<Words> {
    return this.knownVectorsFrom(await this.keeper.manifest())
  }

  /** the same, given a copy of manifest.json the caller has already read (so one search reads it once) */
  async knownVectorsFrom (manifestBytes: Uint8Array): Promise<Words> {
    const fileNames = this.manifests.sharedFileNamesIn(this.manifests.readTop(manifestBytes))
    const key = fileNames.join(',')
    if (this.words?.key !== key) {
      const words = (async () => {
        const found: Words = {}
        await Promise.all(fileNames.map(async fileName => {
          for (const { word, getVector } of parseVectors(await this.keeper.fileNamed(fileName))) found[word] = getVector()
        }))
        return found
      })()
      this.words = { key, words }
      words.catch(() => { if (this.words?.words === words) this.words = undefined }) // a failed load is not remembered
    }
    return this.words.words
  }

  /** every index, with what a search looks at. Given the known vectors, each sign has the vectors of its words */
  async loadLibrary (columns: string[], knownVectors: Words | undefined, forceReload: boolean): Promise<SearchLibrary> {
    return this.loadLibraryFrom(await this.keeper.manifest(), columns, knownVectors, forceReload)
  }

  /** the same, given a copy of manifest.json the caller has already read (so one search reads it once) */
  async loadLibraryFrom (manifestBytes: Uint8Array, _columns: string[], knownVectors: Words | undefined, forceReload: boolean): Promise<SearchLibrary> {
    const manifestText = decode(manifestBytes)
    if (forceReload || this.loaded?.manifestText !== manifestText) {
      const loading = { manifestText, library: this.loadEveryIndex(), vectorsAttached: false }
      this.loaded = loading
      loading.library.catch(() => { if (this.loaded === loading) this.loaded = undefined }) // a failed load is not remembered
    }
    const loaded = this.loaded!
    const library = await loaded.library
    if (knownVectors && !loaded.vectorsAttached) {
      loaded.vectorsAttached = true
      for (const index of Object.values(library)) {
        for (const entry of index.entries) {
          entry.vectors = (entry.words ?? []).flatMap(word => knownVectors[normalizeWord(word)] ?? [])
        }
      }
    }
    return library
  }

  /** the engine's seams, run on this library. `lookupVector` finds a word the signs don't use in the whole vector library */
  asSearchSeams (lookupVector: (word: string) => Promise<WordVector | undefined>): SearchSeams {
    return {
      knownVectors: () => this.knownVectors(),
      lookupVector,
      loadLibrary: (columns, knownVectors, forceReload) => this.loadLibrary(columns, knownVectors, forceReload),
      indexNameOf: entry => entry.indexName ?? ''
    }
  }

  /** the seams for one search: the caller reads manifest.json once, and both seams use that same copy */
  asSearchSeamsFor (manifestBytes: Uint8Array, lookupVector: (word: string) => Promise<WordVector | undefined>): SearchSeams {
    return {
      knownVectors: () => this.knownVectorsFrom(manifestBytes),
      lookupVector,
      loadLibrary: (columns, knownVectors, forceReload) => this.loadLibraryFrom(manifestBytes, columns, knownVectors, forceReload),
      indexNameOf: entry => entry.indexName ?? ''
    }
  }

  private async loadEveryIndex (): Promise<SearchLibrary> {
    const reader = new IndexReader(this.baseUrl, { fetch: fetchThroughTheKeeper(this.keeper, this.baseUrl) })
    const indexes = await Promise.all(this.indexes.map(name => reader.loadIndex(name)))
    // in the order we were given, which is the order we trust them in
    return Object.fromEntries(this.indexes.map((name, place) => [name, indexes[place]])) as unknown as SearchLibrary
  }
}
