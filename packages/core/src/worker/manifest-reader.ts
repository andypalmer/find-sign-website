// The manifest reader: understands the two kinds of manifest file (see "The manifest files" in
// docs/index-format.md) and says which file names they mention. It only reads; it never fetches.

/** the format version this reader understands */
export const knownFormatVersion = 2

/** the top manifest: for each index, the name of that index's own manifest, and the word vector files every index shares */
export type TopManifest = { version: number, indexes: Record<string, string>, vectors: string[] }

/** one index's manifest: every file that index is made of (the word vectors are shared, so the top manifest has them) */
export type IndexManifest = { shardCount: number, shards: string[], scans: string[] }

/** a manifest we can't use, with the reason in plain words */
export class ManifestUnreadable extends Error {
  constructor (words: string) {
    super(words)
    this.name = 'ManifestUnreadable'
  }
}

/** something that can read manifests */
export interface IReadManifests {
  readTop (bytes: Uint8Array): TopManifest
  readIndex (bytes: Uint8Array): IndexManifest
  /** every file name an index manifest mentions, whatever kind of file it is */
  fileNamesIn (index: IndexManifest): string[]
  /** every file name the top manifest mentions besides the index manifests: the shared word vectors */
  sharedFileNamesIn (top: TopManifest): string[]
}

function readJsonObject (bytes: Uint8Array, what: string): Record<string, unknown> {
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new ManifestUnreadable(`the ${what} is not JSON`)
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ManifestUnreadable(`the ${what} is not an object`)
  return value as Record<string, unknown>
}

/**
 * A name goes on the end of the data server's folder address, so it must be one plain file name: no folders,
 * no way up, no other address. (A dot, then letters and numbers, is all a real name needs.)
 */
function plainFileName (name: unknown, what: string): string {
  if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name.includes('..')) {
    throw new ManifestUnreadable(`${what} has a file name that is not a plain file name: ${JSON.stringify(name)}`)
  }
  return name
}

function listOfNames (value: unknown, what: string): string[] {
  if (!Array.isArray(value)) throw new ManifestUnreadable(`${what} is missing, or is not a list`)
  return value.map(name => plainFileName(name, what))
}

export class ManifestReader implements IReadManifests {
  readTop (bytes: Uint8Array): TopManifest {
    const top = readJsonObject(bytes, 'top manifest')
    if (typeof top.version !== 'number') throw new ManifestUnreadable('the top manifest says no version')
    if (top.version !== knownFormatVersion) {
      throw new ManifestUnreadable(`the index is in format version ${top.version}; this worker reads version ${knownFormatVersion}`)
    }
    const indexes = top.indexes
    if (typeof indexes !== 'object' || indexes === null || Array.isArray(indexes)) throw new ManifestUnreadable('the top manifest has no list of indexes')
    return {
      version: top.version,
      indexes: Object.fromEntries(Object.entries(indexes).map(([name, manifestName]) => [name, plainFileName(manifestName, `index "${name}"`)])),
      vectors: listOfNames(top.vectors, 'the vector list')
    }
  }

  readIndex (bytes: Uint8Array): IndexManifest {
    const index = readJsonObject(bytes, 'index manifest')
    if (!Number.isInteger(index.shardCount)) throw new ManifestUnreadable('the index manifest has no whole-number shard count')
    return {
      shardCount: index.shardCount as number,
      shards: listOfNames(index.shards, 'the shard list'),
      scans: listOfNames(index.scans, 'the scan list')
    }
  }

  fileNamesIn (index: IndexManifest): string[] {
    return [...new Set([...index.shards, ...index.scans])]
  }

  sharedFileNamesIn (top: TopManifest): string[] {
    return [...new Set(top.vectors)]
  }
}
