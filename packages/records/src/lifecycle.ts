// How records change from one spider run to the next. Pure: the run's time and the policies come in as
// arguments, so the same inputs always give the same records.
import { canonicalJSON } from './canonical.ts'
import { contentHash, sha256, type Digest } from './content-hash.ts'
import type { MediaItem, Provenance, RecordContent, SignRecord } from './schema.ts'

/** one spider run, identified by when it started (an ISO timestamp) */
export type Run = { at: string }

/** what happened to a sign in a run */
export type Change = 'new' | 'changed' | 'unchanged' | 'returned' | 'missing' | 'removed'

/** when a sign that discovery stops finding is removed, rather than kept as missing */
export type RemovalPolicy = {
  /** removed once this many consecutive runs haven't found it */
  removeAfterMissingRuns: number,
}

export const defaultRemovalPolicy: RemovalPolicy = { removeAfterMissingRuns: 3 }

export type LifecycleOptions = {
  digest?: Digest,
  removal?: RemovalPolicy,
}

/** a sign found by this run: the record it becomes, and how it differs from before */
export async function observe (previous: SignRecord | undefined, content: RecordContent, run: Run, { digest = sha256 }: LifecycleOptions = {}): Promise<{ record: SignRecord, change: Change }> {
  const hash = await contentHash(content, digest)
  const media = keepEncodings(previous?.media ?? [], content.media)

  if (!previous) {
    const provenance: Provenance = { firstSeen: run.at, lastSeen: run.at, lastChanged: run.at, contentHash: hash, status: 'present', missingRuns: 0 }
    return { record: { ...content, media, provenance }, change: 'new' }
  }

  const changed = hash !== previous.provenance.contentHash
  const provenance: Provenance = {
    ...previous.provenance,
    lastSeen: run.at,
    lastChanged: changed ? run.at : previous.provenance.lastChanged,
    contentHash: hash,
    status: 'present',
    missingRuns: 0,
  }
  const change: Change = previous.provenance.status !== 'present' ? 'returned' : changed ? 'changed' : 'unchanged'
  return { record: { ...content, media, provenance }, change }
}

/** a sign this run didn't find: missing, then removed once the policy says so */
export function markMissing (record: SignRecord, { removal = defaultRemovalPolicy }: LifecycleOptions = {}): { record: SignRecord, change: Change } {
  if (record.provenance.status === 'removed') return { record, change: 'removed' }
  const missingRuns = record.provenance.missingRuns + 1
  const status = missingRuns >= removal.removeAfterMissingRuns ? 'removed' : 'missing'
  return { record: { ...record, provenance: { ...record.provenance, status, missingRuns } }, change: status }
}

export type Reconciled = {
  /** every record, sorted by id */
  records: SignRecord[],
  /** record ids by what happened to them in this run */
  changes: Record<Change, string[]>,
}

/** a whole run: every sign discovery found, against the records from before it */
export async function reconcile (previous: readonly SignRecord[], found: readonly RecordContent[], run: Run, options: LifecycleOptions = {}): Promise<Reconciled> {
  const before = new Map(previous.map(record => [record.id, record]))
  const seen = new Set<string>()
  const changes: Record<Change, string[]> = { new: [], changed: [], unchanged: [], returned: [], missing: [], removed: [] }
  const records: SignRecord[] = []

  for (const content of found) {
    if (seen.has(content.id)) throw new Error(`run found the id "${content.id}" more than once`)
    seen.add(content.id)
    const { record, change } = await observe(before.get(content.id), content, run, options)
    records.push(record)
    changes[change].push(record.id)
  }

  for (const record of previous) {
    if (seen.has(record.id)) continue
    const result = markMissing(record, options)
    records.push(result.record)
    changes[result.change].push(record.id)
  }

  records.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  return { records, changes }
}

/** carries the encoder's output over to media whose source hasn't changed, so it isn't encoded again */
export function keepEncodings (previous: readonly MediaItem[], next: readonly MediaItem[]): MediaItem[] {
  const key = (item: MediaItem) => canonicalJSON({ type: item.type, source: item.source })
  const encoded = new Map(previous.flatMap(item => item.encoded ? [[key(item), item.encoded] as const] : []))
  return next.map(item => {
    const kept = item.encoded ?? encoded.get(key(item))
    return kept ? { ...item, encoded: kept } : item
  })
}
