import { expect, describe, it } from 'vitest'
import { createRecordFile, parseRecordFile, reconcile, serialiseRecordFile, RecordValidationError } from '../src/index.ts'
import { sign } from './fixtures.ts'

const provider = { id: 'alpha', name: 'Alpha Dictionary', verb: 'documented', link: 'https://alpha.test/' }

describe('record files', () => {
  it('round-trip through JSON text', async () => {
    const { records } = await reconcile([], [sign('dog'), sign('cat')], { at: '2026-10-20T00:00:00.000Z' })
    const file = createRecordFile(provider, records)
    expect(parseRecordFile(serialiseRecordFile(file))).toEqual(file)
  })

  it('write records sorted by id, for small diffs between runs', async () => {
    const { records } = await reconcile([], [sign('dog'), sign('cat')], { at: '2026-10-20T00:00:00.000Z' })
    const text = serialiseRecordFile({ ...createRecordFile(provider, records), records: [...records].reverse() })
    expect(JSON.parse(text).records.map((r: { id: string }) => r.id)).toEqual(['cat', 'dog'])
  })

  it('reject duplicate ids and unknown versions', async () => {
    const { records } = await reconcile([], [sign('cat')], { at: '2026-10-20T00:00:00.000Z' })
    expect(() => createRecordFile(provider, [...records, ...records])).toThrow(RecordValidationError)
    const file = { ...createRecordFile(provider, records), version: 2 }
    expect(() => parseRecordFile(JSON.stringify(file))).toThrow(RecordValidationError)
  })
})
