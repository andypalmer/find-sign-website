// Converting today's encoded-search-data files to record files and back, using the characterisation fixtures.
import { expect, describe, it } from 'vitest'
import { validateRecordFile } from '@find-sign/records'
import { alphaSearchData, betaSearchData, media } from '@find-sign/test-helpers/fixtures.ts'
import { encodedSearchDataFromRecordFile, recordFileFromEncodedSearchData } from '../src/records/encoded-search-data.ts'
import { withSearchDataDefaults } from '../src/orthagonal/search-data-defaults.ts'

const seenAt = '2026-10-20T00:00:00.000Z'
const convert = (raw: any, provider = 'alpha') => recordFileFromEncodedSearchData(raw, { provider, seenAt, locale: 'en-AU' })

describe('recordFileFromEncodedSearchData()', () => {
  it('makes a valid record file, with the provider details from its entries', async () => {
    const file = await convert(alphaSearchData())
    expect(() => validateRecordFile(file)).not.toThrow()
    expect(file.provider).toEqual({ id: 'alpha', name: 'Alpha Dictionary', verb: 'documented', link: 'https://alpha.test/' })
    expect(file.records.map(r => r.id)).toEqual(['cat', 'dog', 'car', 'hidden'])
  })

  it('takes first seen from the entry timestamp, and last seen from the conversion', async () => {
    const [cat] = (await convert(alphaSearchData())).records
    expect(cat.provenance).toMatchObject({ firstSeen: new Date(3000).toISOString(), lastChanged: new Date(3000).toISOString(), lastSeen: seenAt, status: 'present', missingRuns: 0 })
    const redTruck = (await convert(betaSearchData(), 'beta')).records.find(r => r.id === 'red-truck')!
    expect(redTruck.provenance.firstSeen).toBe(seenAt)
  })

  it('keeps unpublished entries, clippings, and media urls relative to the file', async () => {
    const raw = alphaSearchData()
    raw.dog.media[0].source = { ...raw.dog.media[0].source, clipping: { start: 1.5, end: 3 } } as any
    const records = (await convert(raw)).records
    const hidden = records.find(r => r.id === 'hidden')!
    expect(hidden.published).toBe(false)
    const dog = records.find(r => r.id === 'dog')!
    expect(dog.media[0].source.clipping).toEqual({ start: 1.5, end: 3 })
    expect(dog.media[0].encoded!.thumbnail).toBe('dog-media/dog-0.webp')
  })

  it('fixes and reports what the record schema does not allow: null versions, clippings ending before they start', async () => {
    const raw = alphaSearchData()
    raw.cat.media[0].source = { ...raw.cat.media[0].source, version: null } as any
    raw.dog.media[0].source = { ...raw.dog.media[0].source, clipping: { start: 29.8, end: 21.7 } } as any
    const quirks: { id: string, message: string }[] = []
    const records = (await recordFileFromEncodedSearchData(raw as any, { provider: 'alpha', seenAt, onQuirk: quirk => quirks.push(quirk) })).records
    expect(quirks.map(q => q.id)).toEqual(['cat', 'dog'])
    expect(records.find(r => r.id === 'cat')!.media[0].source.version).toBeUndefined()
    expect(records.find(r => r.id === 'dog')!.media[0].source.clipping).toEqual({ start: 29.8 })
  })

  it('applies the same defaults as readEncodedSearchData, such as words from the title', async () => {
    const [entry] = (await convert({ a: { title: 'Hello, big world!', media: [media('a')] } })).records
    expect(entry).toMatchObject({ id: 'a', words: ['Hello', 'big', 'world'], tags: [], body: '' })
  })
})

describe('encodedSearchDataFromRecordFile()', () => {
  it('gives back what readEncodedSearchData would read from the original, before resolving urls', async () => {
    for (const [provider, raw] of [['alpha', alphaSearchData()], ['beta', betaSearchData()]] as const) {
      const expected = withSearchDataDefaults(structuredClone(raw) as any, 'en-AU')
      // an entry without a timestamp gains the conversion time, as that's when it was first seen
      for (const entry of Object.values(expected)) entry.timestamp ??= Date.parse(seenAt)
      expect(encodedSearchDataFromRecordFile(await convert(raw, provider))).toEqual(expected)
    }
  })

  it('leaves out removed records and media the encoder has not reached', async () => {
    const file = await convert(alphaSearchData())
    file.records[0].provenance.status = 'removed'
    delete file.records[1].media[0].encoded
    const data = encodedSearchDataFromRecordFile(file)
    expect(Object.keys(data)).toEqual(['dog', 'car', 'hidden'])
    expect(data.dog.media).toEqual([])
  })
})
