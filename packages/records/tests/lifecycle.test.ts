import { expect, describe, it } from 'vitest'
import { keepEncodings, markMissing, observe, reconcile, type SignRecord } from '../src/index.ts'
import { encodedVideo, sign, video } from './fixtures.ts'

const day = (n: number) => ({ at: `2026-10-${String(n).padStart(2, '0')}T00:00:00.000Z` })

describe('observe()', () => {
  it('starts a new sign as present, first and last seen now', async () => {
    const { record, change } = await observe(undefined, sign('cat'), day(1))
    expect(change).toBe('new')
    expect(record.provenance).toMatchObject({ firstSeen: day(1).at, lastSeen: day(1).at, lastChanged: day(1).at, status: 'present', missingRuns: 0 })
  })

  it('keeps firstSeen and lastChanged for an unchanged sign, moving only lastSeen', async () => {
    const first = (await observe(undefined, sign('cat'), day(1))).record
    const { record, change } = await observe(first, sign('cat'), day(2))
    expect(change).toBe('unchanged')
    expect(record.provenance).toMatchObject({ firstSeen: day(1).at, lastSeen: day(2).at, lastChanged: day(1).at })
  })

  it('records the run a sign changed in', async () => {
    const first = (await observe(undefined, sign('cat'), day(1))).record
    const { record, change } = await observe(first, sign('cat', { title: 'Kitty' }), day(2))
    expect(change).toBe('changed')
    expect(record.title).toBe('Kitty')
    expect(record.provenance).toMatchObject({ firstSeen: day(1).at, lastChanged: day(2).at })
    expect(record.provenance.contentHash).not.toBe(first.provenance.contentHash)
  })

  it('brings a missing sign back as returned', async () => {
    const first = (await observe(undefined, sign('cat'), day(1))).record
    const missing = markMissing(first).record
    const { record, change } = await observe(missing, sign('cat'), day(3))
    expect(change).toBe('returned')
    expect(record.provenance).toMatchObject({ status: 'present', missingRuns: 0 })
  })

  it('keeps encodes for media whose source is unchanged', async () => {
    const first = (await observe(undefined, sign('cat', { media: [encodedVideo('cat')] }), day(1))).record
    const { record } = await observe(first, sign('cat'), day(2))
    expect(record.media[0].encoded).toEqual(encodedVideo('cat').encoded)
  })
})

describe('markMissing()', () => {
  it('counts missed runs, removing the sign when the policy says', async () => {
    let record: SignRecord = (await observe(undefined, sign('cat'), day(1))).record
    const changes = []
    for (let run = 0; run < 3; run++) {
      const result = markMissing(record, { removal: { removeAfterMissingRuns: 2 } })
      record = result.record
      changes.push(result.change)
    }
    expect(changes).toEqual(['missing', 'removed', 'removed'])
    expect(record.provenance).toMatchObject({ status: 'removed', missingRuns: 2, lastSeen: day(1).at })
  })
})

describe('keepEncodings()', () => {
  it('drops encodes when the source changes, so the media is encoded again', () => {
    expect(keepEncodings([encodedVideo('cat', '1')], [video('cat', '2')])).toEqual([video('cat', '2')])
  })
})

describe('reconcile()', () => {
  it('sorts a run into new, changed, unchanged, returned, missing and removed', async () => {
    const before = (await reconcile([], [sign('cat'), sign('dog'), sign('car'), sign('emu')], day(1))).records
    const later = (await reconcile(before, [sign('cat'), sign('dog'), sign('car')], day(2), { removal: { removeAfterMissingRuns: 3 } })).records
    const { records, changes } = await reconcile(later, [sign('cat'), sign('dog', { title: 'Hound' }), sign('emu'), sign('fox')], day(3), { removal: { removeAfterMissingRuns: 1 } })
    expect(changes).toEqual({ new: ['fox'], changed: ['dog'], unchanged: ['cat'], returned: ['emu'], missing: [], removed: ['car'] })
    expect(records.map(r => r.id)).toEqual(['car', 'cat', 'dog', 'emu', 'fox'])
  })

  it('refuses a run that found the same id twice', async () => {
    await expect(reconcile([], [sign('cat'), sign('cat')], day(1))).rejects.toThrow('"cat" more than once')
  })
})
