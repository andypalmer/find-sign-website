import { describe, it, expect } from 'vitest'
import { ManifestReader, ManifestUnreadable } from '../src/worker/manifest-reader.ts'

const bytes = (value: unknown) => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value))
const reader = new ManifestReader()
const goodTop = { version: 2, indexes: { alpha: 'index-alpha.1a2b3c4d5e.json' }, vectors: ['vectors-0.dddddddddd.lps', 'vectors-1.eeeeeeeeee.lps'] }

describe('the manifest reader, reading the top manifest', () => {
  it('gives the name of each index\'s own manifest', () => {
    const top = reader.readTop(bytes({ ...goodTop, indexes: { alpha: 'index-alpha.1a2b3c4d5e.json', beta: 'index-beta.9f8e7d6c5b.json' } }))

    expect(top.indexes).toEqual({ alpha: 'index-alpha.1a2b3c4d5e.json', beta: 'index-beta.9f8e7d6c5b.json' })
  })

  it('gives the names of the word vector files that every index shares', () => {
    const top = reader.readTop(bytes(goodTop))

    expect(top.vectors).toEqual(goodTop.vectors)
    expect(reader.sharedFileNamesIn(top)).toEqual(goodTop.vectors)
  })

  it('does not list a shared file twice, even if the manifest does', () => {
    const top = reader.readTop(bytes({ ...goodTop, vectors: ['vectors-0.dddddddddd.lps', 'vectors-0.dddddddddd.lps'] }))

    expect(reader.sharedFileNamesIn(top)).toEqual(['vectors-0.dddddddddd.lps'])
  })

  it('says so when the format is one it does not know, so the page can use its fallback', () => {
    expect(() => reader.readTop(bytes({ ...goodTop, version: 3 }))).toThrow(ManifestUnreadable)
    expect(() => reader.readTop(bytes({ ...goodTop, version: 3 }))).toThrow(/version 3/)
  })

  it.each([
    ['text that is not JSON', 'not json at all'],
    ['something that is not an object', '[1,2]'],
    ['no version', { indexes: {}, vectors: [] }],
    ['no list of indexes', { version: 2, vectors: [] }],
    ['an index whose manifest name is not text', { ...goodTop, indexes: { alpha: 7 } }],
    ['no list of vector files', { version: 2, indexes: {} }],
    ['a list of vector files that is not a list', { ...goodTop, vectors: 'vectors-0.dddddddddd.lps' }],
    ['a vector file name that is not text', { ...goodTop, vectors: [7] }]
  ])('refuses %s, rather than treating a missing list as an empty one that would make the keeper drop files', (_, content) => {
    expect(() => reader.readTop(bytes(content))).toThrow(ManifestUnreadable)
  })

  it.each([
    ['a folder path', 'sub/index.1a2b3c4d5e.json'],
    ['a way up out of the folder', '../index.json'],
    ['a web address', 'https://elsewhere.example/x.json'],
    ['an empty name', '']
  ])('refuses a file name that is %s, because names are put on the end of the data server\'s address', (_, name) => {
    expect(() => reader.readTop(bytes({ ...goodTop, indexes: { alpha: name } }))).toThrow(ManifestUnreadable)
    expect(() => reader.readTop(bytes({ ...goodTop, vectors: [name] }))).toThrow(ManifestUnreadable)
  })
})

describe('the manifest reader, reading an index manifest', () => {
  const index = { shardCount: 2, shards: ['shard-0.aaaaaaaaaa.json', 'shard-1.bbbbbbbbbb.json'], scans: ['scan-0.cccccccccc.json'] }

  it('lists every file the index is made of, whatever kind it is', () => {
    const names = reader.fileNamesIn(reader.readIndex(bytes(index)))

    expect([...names].sort()).toEqual([...index.shards, ...index.scans].sort())
  })

  it('has no list of vector files, because the vectors are shared and manifest.json names them', () => {
    expect(() => reader.readIndex(bytes(index))).not.toThrow()
  })

  it('gives the shard count as written', () => {
    expect(reader.readIndex(bytes(index)).shardCount).toBe(2)
  })

  it('does not list a file twice, even if the manifest does', () => {
    const names = reader.fileNamesIn(reader.readIndex(bytes({ ...index, scans: ['shard-0.aaaaaaaaaa.json'] })))

    expect(names.filter(name => name === 'shard-0.aaaaaaaaaa.json')).toHaveLength(1)
  })

  it.each([
    ['text that is not JSON', 'nope'],
    ['no shard list', { ...index, shards: undefined }],
    ['no scan list', { ...index, scans: undefined }],
    ['a shard count that is not a whole number', { ...index, shardCount: 'many' }],
    ['a list with something that is not a name', { ...index, shards: [1] }]
  ])('refuses %s, rather than treating it as an empty list that would make the keeper drop files', (_, content) => {
    expect(() => reader.readIndex(bytes(content))).toThrow(ManifestUnreadable)
  })

  it('refuses a file name that would leave the data server\'s folder', () => {
    expect(() => reader.readIndex(bytes({ ...index, scans: ['../../secret.json'] }))).toThrow(ManifestUnreadable)
  })
})
