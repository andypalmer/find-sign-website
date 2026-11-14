import { describe, it, expect } from 'vitest'
import { ManifestReader, ManifestUnreadable } from '../src/worker/manifest-reader.ts'

const bytes = (value: unknown) => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value))
const reader = new ManifestReader()

describe('the manifest reader, reading the top manifest', () => {
  it('gives the name of each index\'s own manifest', () => {
    const top = reader.readTop(bytes({ version: 2, indexes: { alpha: 'index-alpha.1a2b3c4d5e.json', beta: 'index-beta.9f8e7d6c5b.json' } }))

    expect(top.indexes).toEqual({ alpha: 'index-alpha.1a2b3c4d5e.json', beta: 'index-beta.9f8e7d6c5b.json' })
  })

  it('says so when the format is one it does not know, so the page can use its fallback', () => {
    expect(() => reader.readTop(bytes({ version: 3, indexes: {} }))).toThrow(ManifestUnreadable)
    expect(() => reader.readTop(bytes({ version: 3, indexes: {} }))).toThrow(/version 3/)
  })

  it.each([
    ['text that is not JSON', 'not json at all'],
    ['something that is not an object', '[1,2]'],
    ['no version', { indexes: {} }],
    ['no list of indexes', { version: 2 }],
    ['an index whose manifest name is not text', { version: 2, indexes: { alpha: 7 } }]
  ])('refuses %s', (_, content) => {
    expect(() => reader.readTop(bytes(content))).toThrow(ManifestUnreadable)
  })

  it.each([
    ['a folder path', 'sub/index.1a2b3c4d5e.json'],
    ['a way up out of the folder', '../index.json'],
    ['a web address', 'https://elsewhere.example/x.json'],
    ['an empty name', '']
  ])('refuses a file name that is %s, because names are put on the end of the data server\'s address', (_, name) => {
    expect(() => reader.readTop(bytes({ version: 2, indexes: { alpha: name } }))).toThrow(ManifestUnreadable)
  })
})

describe('the manifest reader, reading an index manifest', () => {
  const index = { shardCount: 2, shards: ['shard-0.aaaaaaaaaa.json', 'shard-1.bbbbbbbbbb.json'], scans: ['scan-0.cccccccccc.json'], vectors: ['vectors-0.dddddddddd.lps'] }

  it('lists every file the index is made of, whatever kind it is', () => {
    const names = reader.fileNamesIn(reader.readIndex(bytes(index)))

    expect([...names].sort()).toEqual([...index.shards, ...index.scans, ...index.vectors].sort())
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
    ['no vector list', { ...index, vectors: undefined }],
    ['a shard count that is not a whole number', { ...index, shardCount: 'many' }],
    ['a list with something that is not a name', { ...index, shards: [1] }]
  ])('refuses %s, rather than treating it as an empty list that would make the keeper drop files', (_, content) => {
    expect(() => reader.readIndex(bytes(content))).toThrow(ManifestUnreadable)
  })

  it('refuses a file name that would leave the data server\'s folder', () => {
    expect(() => reader.readIndex(bytes({ ...index, vectors: ['../../secret.lps'] }))).toThrow(ManifestUnreadable)
  })
})
