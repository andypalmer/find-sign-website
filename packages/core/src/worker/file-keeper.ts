// The file keeper: the worker's helper that hands out index files. It fetches a file once, puts it on
// a shelf, and from then on hands it out from the shelf. (Later rounds teach it to check the manifest
// and to clear the shelf.)
import { ManifestReader, type IndexManifest, type IReadManifests } from './manifest-reader.ts'

/** asks the network for a file; the real worker passes `fetch` */
export type FetchAFile = (url: string, init?: { cache?: RequestCache, headers?: Record<string, string> }) => Promise<Response>

/** a shelf that remembers files by name; the real one is backed by browser storage, tests use a fake */
export interface IRememberFilesByName {
  /** the bytes kept under this name, or undefined if there are none */
  recall (name: string): Promise<Uint8Array | undefined>
  remember (name: string, bytes: Uint8Array): Promise<void>
}

/** something that can be asked for an index file by its name */
export interface IHandOverIndexFiles {
  fileNamed (name: string): Promise<Uint8Array>
  /** the newest manifest.json; costs one small question to the server, and usually no download */
  manifest (): Promise<Uint8Array>
  /** what each index is made of right now, by index name */
  currentIndexes (): Promise<Record<string, IndexManifest>>
}

const manifestName = 'manifest.json'
/** the shelf also holds the server's tag for the manifest we have, so a restarted worker can still ask "is this still the newest?" */
const manifestTagName = 'manifest.json.tag'
const decode = (bytes: Uint8Array | undefined) => bytes ? new TextDecoder().decode(bytes) : ''

export class FileKeeper implements IHandOverIndexFiles {
  /** files being fetched right now; anyone else who wants one joins the same fetch */
  private onTheWay = new Map<string, Promise<Uint8Array>>()
  /** the manifest check that is under way, if there is one */
  private manifestCheck: Promise<Uint8Array> | undefined

  /** `baseUrl` is the folder on the data server that the index files live in */
  constructor (
    private fetchFile: FetchAFile,
    private shelf: IRememberFilesByName,
    private baseUrl: string,
    private reader: IReadManifests = new ManifestReader()
  ) {}

  /**
   * Asks the top manifest which index manifests are current. An index manifest never changes under its name,
   * so one we already hold costs nothing; only a new name is fetched. That is how a build that touches one
   * index costs one small file, not eleven.
   */
  async currentIndexes (): Promise<Record<string, IndexManifest>> {
    const top = this.reader.readTop(await this.manifest())
    const indexes = await Promise.all(Object.entries(top.indexes).map(async ([indexName, manifestFile]) => {
      return [indexName, this.reader.readIndex(await this.fileNamed(manifestFile))] as const
    }))
    return Object.fromEntries(indexes)
  }

  fileNamed (name: string): Promise<Uint8Array> {
    const alreadyOnTheWay = this.onTheWay.get(name)
    if (alreadyOnTheWay) return alreadyOnTheWay

    const fetching = this.keptOrFetched(name)
    this.onTheWay.set(name, fetching)
    // once it has landed (or failed) the shelf, or a fresh try, takes over
    const forgetIt = () => { this.onTheWay.delete(name) }
    fetching.then(forgetIt, forgetIt)
    return fetching
  }

  /**
   * The manifest is the one file that changes, so it is never served without asking the server. We say
   * which version we hold; the server either says "still the newest" (nothing to download) or sends the new one.
   * If the server can't be reached we hand out the copy we hold: it may be behind, but it only points at real files.
   * (Don't ask fileNamed for it: that would hand out the kept copy for ever.)
   */
  manifest (): Promise<Uint8Array> {
    // askers who arrive while a check is under way join it, so a burst of searches makes one request
    if (!this.manifestCheck) {
      const clearIt = () => { this.manifestCheck = undefined }
      this.manifestCheck = this.askAboutTheManifest()
      this.manifestCheck.then(clearIt, clearIt)
    }
    return this.manifestCheck
  }

  private async askAboutTheManifest (): Promise<Uint8Array> {
    const kept = await this.shelf.recall(manifestName)
    const keptTag = decode(await this.shelf.recall(manifestTagName))
    let response: Response
    try {
      response = await this.fetchFile(`${this.baseUrl}/${manifestName}`, {
        cache: 'no-cache',
        headers: kept && keptTag ? { 'If-None-Match': keptTag } : undefined
      })
    } catch (error) {
      // can't reach the server. Files are only ever added, so an older manifest still points at real files
      if (kept) return kept
      throw error
    }
    if (response.status === 304 && kept) return kept
    if (!response.ok) {
      if (kept) return kept // the same reasoning: a server in trouble is no reason to stop searching
      throw new Error(`could not fetch ${manifestName}: status ${response.status}`)
    }

    const bytes = new Uint8Array(await response.arrayBuffer())
    await this.shelf.remember(manifestName, bytes)
    // no tag sent means nothing to check against next time; write an empty one so an old tag is not left behind
    await this.shelf.remember(manifestTagName, new TextEncoder().encode(response.headers.get('etag') ?? ''))
    return bytes
  }

  private async keptOrFetched (name: string): Promise<Uint8Array> {
    const kept = await this.shelf.recall(name)
    if (kept) return kept

    let response = await this.fetchFile(`${this.baseUrl}/${name}`)
    if (response.status === 404) {
      // The build may have moved on and the server tidied this file away. Look at the manifest afresh (the
      // manifest is the one file that can change, so never trust a copy of it), then try once more.
      await this.manifest()
      response = await this.fetchFile(`${this.baseUrl}/${name}`)
    }
    if (!response.ok) throw new Error(`could not fetch ${name}: status ${response.status}`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    await this.shelf.remember(name, bytes)
    return bytes
  }
}
