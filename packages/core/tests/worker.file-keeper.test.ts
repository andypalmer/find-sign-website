import { describe, it, expect } from 'vitest'
import { FakeDataServer } from '@find-sign/test-helpers/fake-data-server.ts'
import { FakeShelf } from '@find-sign/test-helpers/fake-shelf.ts'
import { FileKeeper } from '../src/worker/file-keeper.ts'

const base = 'https://data.example/index'
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

function keeperWith (files: Record<string, string>) {
  const server = new FakeDataServer()
  for (const [name, contents] of Object.entries(files)) server.set(`${base}/${name}`, contents)
  const shelf = new FakeShelf()
  const keeper = new FileKeeper(url => server.fetch(url), shelf, base)
  return { server, shelf, keeper }
}

describe('the file keeper, asked for a file named by its contents', () => {
  it('fetches the file from the data server the first time', async () => {
    const { keeper } = keeperWith({ 'shard-12.4f9a1c07be.json': '{"signs":[1]}' })

    expect(text(await keeper.fileNamed('shard-12.4f9a1c07be.json'))).toBe('{"signs":[1]}')
  })

  it('keeps the file, so asking again does not fetch it again', async () => {
    const { keeper, server } = keeperWith({ 'shard-12.4f9a1c07be.json': '{"signs":[1]}' })

    await keeper.fileNamed('shard-12.4f9a1c07be.json')
    const second = await keeper.fileNamed('shard-12.4f9a1c07be.json')

    expect(text(second)).toBe('{"signs":[1]}')
    expect(server.requests).toHaveLength(1)
  })

  it('keeps each file under its own name', async () => {
    const { keeper, server } = keeperWith({ 'shard-1.aaaaaaaaaa.json': 'one', 'shard-2.bbbbbbbbbb.json': 'two' })

    expect(text(await keeper.fileNamed('shard-1.aaaaaaaaaa.json'))).toBe('one')
    expect(text(await keeper.fileNamed('shard-2.bbbbbbbbbb.json'))).toBe('two')
    expect(text(await keeper.fileNamed('shard-1.aaaaaaaaaa.json'))).toBe('one')
    expect(server.requests).toHaveLength(2)
  })

  it('serves a file the shelf already holds without going to the network at all', async () => {
    const { keeper, shelf, server } = keeperWith({})
    await shelf.remember('scan-0.cccccccccc.json', new TextEncoder().encode('already here'))

    expect(text(await keeper.fileNamed('scan-0.cccccccccc.json'))).toBe('already here')
    expect(server.requests).toEqual([])
  })

  it('shares one fetch between askers who want the same file at the same time', async () => {
    const { keeper, server } = keeperWith({ 'shard-3.dddddddddd.json': 'shared' })

    const [first, second, third] = await Promise.all([
      keeper.fileNamed('shard-3.dddddddddd.json'),
      keeper.fileNamed('shard-3.dddddddddd.json'),
      keeper.fileNamed('shard-3.dddddddddd.json')
    ])

    expect([text(first), text(second), text(third)]).toEqual(['shared', 'shared', 'shared'])
    expect(server.requests).toHaveLength(1)
  })

  it('does not share a failed fetch with later askers: they get to try again', async () => {
    const { keeper, server } = keeperWith({ 'shard-4.eeeeeeeeee.json': 'late' })
    server.failures.set(`${base}/shard-4.eeeeeeeeee.json`, 'network')

    await expect(keeper.fileNamed('shard-4.eeeeeeeeee.json')).rejects.toThrow()
    server.failures.delete(`${base}/shard-4.eeeeeeeeee.json`)

    expect(text(await keeper.fileNamed('shard-4.eeeeeeeeee.json'))).toBe('late')
  })
})
