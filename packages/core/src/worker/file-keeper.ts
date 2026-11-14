// The file keeper: the worker's helper that hands out index files. It fetches a file once, puts it on
// a shelf, and from then on hands it out from the shelf. (Later rounds teach it to check the manifest,
// to share one fetch between askers, and to clear the shelf.)

/** asks the network for a file; the real worker passes `fetch` */
export type FetchAFile = (url: string) => Promise<Response>

/** a shelf that remembers files by name; the real one is backed by browser storage, tests use a fake */
export interface IRememberFilesByName {
  /** the bytes kept under this name, or undefined if there are none */
  recall (name: string): Promise<Uint8Array | undefined>
  remember (name: string, bytes: Uint8Array): Promise<void>
}

/** something that can be asked for an index file by its name */
export interface IHandOverIndexFiles {
  fileNamed (name: string): Promise<Uint8Array>
}

export class FileKeeper implements IHandOverIndexFiles {
  /** `baseUrl` is the folder on the data server that the index files live in */
  constructor (private fetchFile: FetchAFile, private shelf: IRememberFilesByName, private baseUrl: string) {}

  async fileNamed (name: string): Promise<Uint8Array> {
    const kept = await this.shelf.recall(name)
    if (kept) return kept

    const response = await this.fetchFile(`${this.baseUrl}/${name}`)
    if (!response.ok) throw new Error(`could not fetch ${name}: status ${response.status}`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    await this.shelf.remember(name, bytes)
    return bytes
  }
}
