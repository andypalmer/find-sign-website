// The file keeper: the worker's helper that hands out index files. It fetches a file once, puts it on
// a shelf, and from then on hands it out from the shelf. (Later rounds teach it to check the manifest
// and to clear the shelf.)
import { ManifestReader, type IndexManifest, type IReadManifests, type TopManifest } from './manifest-reader.ts'

/** asks the network for a file; the real worker passes `fetch` */
export type FetchAFile = (url: string, init?: { cache?: RequestCache, headers?: Record<string, string> }) => Promise<Response>

/** a shelf that remembers files by name; the real one is backed by browser storage, tests use a fake */
export interface IRememberFilesByName {
  /** the bytes kept under this name, or undefined if there are none */
  recall (name: string): Promise<Uint8Array | undefined>
  remember (name: string, bytes: Uint8Array): Promise<void>
  /** the name of everything on the shelf */
  names (): Promise<string[]>
  /** throw one file away; nothing happens if it isn't there */
  forget (name: string): Promise<void>
}

/** a file the keeper could not get, and the status the data server gave. (A network that can't be reached is not this: the fetch itself fails.) */
export class FileUnavailable extends Error {
  constructor (readonly fileName: string, readonly status: number) {
    super(`could not fetch ${fileName}: status ${status}`)
    this.name = 'FileUnavailable'
  }
}

/** something that can say what time it is, in milliseconds */
export interface IReadTheTime {
  now (): number
}

const oneDay = 24 * 60 * 60 * 1000

/** something that can be asked for an index file by its name */
export interface IHandOverIndexFiles {
  fileNamed (name: string): Promise<Uint8Array>
  /** the newest manifest.json; costs one small question to the server, and usually no download */
  manifest (): Promise<Uint8Array>
  /** what each index is made of right now, by index name */
  currentIndexes (): Promise<Record<string, IndexManifest>>
  /** throw away files that have been out of date for longer than the grace period; says which it threw away */
  tidy (): Promise<string[]>
}

/** what the manifests say right now: the manifest as written, the top manifest read, and each index's manifest read */
type CurrentManifests = { manifestBytes: Uint8Array, top: TopManifest, indexes: Record<string, IndexManifest> }

const manifestName = 'manifest.json'
/** the shelf also holds the server's tag for the manifest we have, so a restarted worker can still ask "is this still the newest?" */
const manifestTagName = 'manifest.json.tag'
/** where the keeper writes down when it first noticed each file was out of date */
const noticesName = 'keeper-notices.json'
/** a copy of the manifest the keeper last finished tidying against, to tell when the manifest has changed */
const tidiedAgainstName = 'keeper-tidied-against.json'
/** files on the shelf that are the keeper's own, not index files, so they are never tidied away */
const ownFiles = new Set([manifestName, manifestTagName, noticesName, tidiedAgainstName])
const decode = (bytes: Uint8Array | undefined) => bytes ? new TextDecoder().decode(bytes) : ''

export class FileKeeper implements IHandOverIndexFiles {
  /** files being fetched right now; anyone else who wants one joins the same fetch */
  private onTheWay = new Map<string, Promise<Uint8Array>>()
  /** the manifest check that is under way, if there is one */
  private manifestCheck: Promise<Uint8Array> | undefined

  /** `baseUrl` is the folder on the data server that the index files live in */
  private reader: IReadManifests
  private clock: IReadTheTime
  private graceMs: number

  constructor (
    private fetchFile: FetchAFile,
    private shelf: IRememberFilesByName,
    private baseUrl: string,
    options: { reader?: IReadManifests, clock?: IReadTheTime, graceMs?: number } = {}
  ) {
    this.reader = options.reader ?? new ManifestReader()
    this.clock = options.clock ?? { now: () => Date.now() }
    this.graceMs = options.graceMs ?? 30 * oneDay
  }

  /**
   * Asks the top manifest which index manifests are current. An index manifest never changes under its name,
   * so one we already hold costs nothing; only a new name is fetched. That is how a build that touches one
   * index costs one small file, not eleven.
   */
  async currentIndexes (): Promise<Record<string, IndexManifest>> {
    const current = await this.currentManifests()
    await this.tidyIfDue(current)
    return current.indexes
  }

  /** the top manifest's index manifest names, and what each of those says */
  private async currentManifests (): Promise<CurrentManifests> {
    const manifestBytes = await this.manifest()
    const top = this.reader.readTop(manifestBytes)
    const indexes = await Promise.all(Object.entries(top.indexes).map(async ([indexName, manifestFile]) => {
      return [indexName, this.reader.readIndex(await this.fileNamed(manifestFile))] as const
    }))
    return { manifestBytes, top, indexes: Object.fromEntries(indexes) }
  }

  /**
   * Throws away kept files that no current manifest mentions and that we first noticed were out of date more
   * than the grace period ago. A visitor part-way through a session may still want a file the newest build
   * has dropped, so we wait. We write down when we first noticed, so the wait survives a restart. If we
   * cannot read the manifest we cannot tell what is current, so we throw nothing away.
   * (A file fetched at the very moment of a tidy is safe: the grace period is days, not moments.)
   */
  async tidy (): Promise<string[]> {
    return this.tidyAgainst(await this.currentManifests())
  }

  /**
   * Tidies when something could have changed: the manifest is not the one we last tidied against, or a file
   * we are waiting on has waited long enough. Otherwise everything we hold is as current as it was last time,
   * and there is nothing to do. A failed tidy must not spoil the search that set it off; it is tried again
   * next time because the "tidied against" copy is only written when a tidy finishes.
   */
  private async tidyIfDue (current: CurrentManifests): Promise<void> {
    try {
      const tidiedAgainst = await this.shelf.recall(tidiedAgainstName)
      const manifestChanged = !tidiedAgainst || decode(tidiedAgainst) !== decode(current.manifestBytes)
      const oldestNotice = Math.min(...Object.values(await this.readNotices()))
      // with no notes there is no oldest one, and the sum below comes out false, so no tidy is due
      const aWaitIsOver = this.clock.now() - oldestNotice > this.graceMs
      if (manifestChanged || aWaitIsOver) await this.tidyAgainst(current)
    } catch {
      // see above
    }
  }

  /**
   * Throws away kept files that no current manifest mentions and that we first noticed were out of date more
   * than the grace period ago. A visitor part-way through a session may still want a file the newest build
   * has dropped, so we wait. We write down when we first noticed, so the wait survives a restart. If we
   * cannot read the manifest we cannot tell what is current, so we throw nothing away.
   * (A file fetched at the very moment of a tidy is safe: the grace period is days, not moments.)
   */
  private async tidyAgainst ({ manifestBytes, top, indexes }: CurrentManifests): Promise<string[]> {
    const current = new Set<string>([...Object.values(top.indexes), ...this.reader.sharedFileNamesIn(top)])
    for (const index of Object.values(indexes)) for (const name of this.reader.fileNamesIn(index)) current.add(name)

    const noticedAt = await this.readNotices()
    const now = this.clock.now()
    const stillOutOfDate: Record<string, number> = {}
    const dropped: string[] = []
    for (const name of await this.shelf.names()) {
      if (current.has(name) || ownFiles.has(name)) continue
      const since = noticedAt[name] ?? now
      if (now - since > this.graceMs) {
        await this.shelf.forget(name)
        dropped.push(name)
      } else {
        stillOutOfDate[name] = since
      }
    }
    await this.shelf.remember(noticesName, new TextEncoder().encode(JSON.stringify(stillOutOfDate)))
    await this.shelf.remember(tidiedAgainstName, manifestBytes)
    return dropped
  }

  /** when each out-of-date file was first noticed, as written down by an earlier tidy */
  private async readNotices (): Promise<Record<string, number>> {
    const written = await this.shelf.recall(noticesName)
    if (!written) return {}
    try {
      return JSON.parse(decode(written))
    } catch {
      return {} // unreadable notes only mean the wait starts again
    }
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
    if (!response.ok) throw new FileUnavailable(name, response.status)
    const bytes = new Uint8Array(await response.arrayBuffer())
    await this.shelf.remember(name, bytes)
    return bytes
  }
}
