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
  const keeper = new FileKeeper((url, init) => server.fetch(url, init), shelf, base)
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

describe('the file keeper, asked for a file the server no longer has', () => {
  // a server where the wanted file shows up once the manifest has been fetched again
  function serverThatCatchesUp (name: string, contents: string) {
    const server = new FakeDataServer()
    const keeper = new FileKeeper(async (url, init) => {
      const response = await server.fetch(url, init)
      if (url.endsWith('/manifest.json')) server.set(`${base}/${name}`, contents)
      return response
    }, new FakeShelf(), base)
    server.set(`${base}/manifest.json`, '{"version":2}')
    return { server, keeper }
  }

  it('fetches the manifest again, ignoring its cache, and asks for the file once more', async () => {
    const { keeper, server } = serverThatCatchesUp('shard-5.ffffffffff.json', 'now here')

    expect(text(await keeper.fileNamed('shard-5.ffffffffff.json'))).toBe('now here')
    expect(server.requests.map(r => r.path.split('/').pop())).toEqual(['shard-5.ffffffffff.json', 'manifest.json', 'shard-5.ffffffffff.json'])
    expect(server.requests[1].cache).toBe('no-cache')
  })

  it('gives up after trying once more, rather than going round in circles', async () => {
    const { keeper, server } = keeperWith({ 'manifest.json': '{"version":2}' })

    await expect(keeper.fileNamed('shard-6.0000000000.json')).rejects.toThrow(/shard-6/)
    expect(server.requests).toHaveLength(3)
  })

  it('does not refetch the manifest for a failure that is not a missing file', async () => {
    const { keeper, server } = keeperWith({ 'manifest.json': '{"version":2}' })
    server.failures.set(`${base}/shard-7.1111111111.json`, 500)
    server.failures.set(`${base}/shard-8.2222222222.json`, 'network')

    await expect(keeper.fileNamed('shard-7.1111111111.json')).rejects.toThrow()
    await expect(keeper.fileNamed('shard-8.2222222222.json')).rejects.toThrow()
    expect(server.requests.filter(r => r.path.endsWith('manifest.json'))).toEqual([])
  })
})

describe('the file keeper, asked for the manifest', () => {
  const manifestUrl = `${base}/manifest.json`
  const ifNoneMatch = (request: { headers: Record<string, string> }) => request.headers['if-none-match']

  it('fetches it the first time, asking the network to check even if it has a copy, and without any "already have" tag', async () => {
    const { keeper, server } = keeperWith({ 'manifest.json': '{"build":1}' })

    expect(text(await keeper.manifest())).toBe('{"build":1}')
    expect(server.requests).toHaveLength(1)
    expect(server.requests[0].cache).toBe('no-cache')
    expect(ifNoneMatch(server.requests[0])).toBeUndefined()
  })

  it('says which version it holds when it checks again, and keeps its copy when the server says nothing changed', async () => {
    const { keeper, server } = keeperWith({ 'manifest.json': '{"build":1}' })
    await keeper.manifest()

    expect(text(await keeper.manifest())).toBe('{"build":1}')
    expect(ifNoneMatch(server.requests[1])).toBeTruthy()
  })

  it('takes the new manifest when the server has one, and from then on checks against that one', async () => {
    const { keeper, server } = keeperWith({ 'manifest.json': '{"build":1}' })
    await keeper.manifest()
    server.set(manifestUrl, '{"build":2}')

    expect(text(await keeper.manifest())).toBe('{"build":2}')
    expect(text(await keeper.manifest())).toBe('{"build":2}')
    expect(ifNoneMatch(server.requests[2])).not.toBe(ifNoneMatch(server.requests[1]))
    expect(ifNoneMatch(server.requests[2])).toBeTruthy()
  })

  it('still knows which version it holds after the worker has been stopped and started again', async () => {
    const { keeper, server, shelf } = keeperWith({ 'manifest.json': '{"build":1}' })
    await keeper.manifest()
    const afterRestart = new FileKeeper((url, init) => server.fetch(url, init), shelf, base)

    expect(text(await afterRestart.manifest())).toBe('{"build":1}')
    expect(ifNoneMatch(server.requests[1])).toBeTruthy()
  })

  it('does not hold on to an old tag when the server stops sending tags', async () => {
    const { server, shelf } = keeperWith({ 'manifest.json': '{"build":1}' })
    let tags = true
    const keeper = new FileKeeper(async (url, init) => {
      const response = await server.fetch(url, init)
      if (tags) return response
      return new Response(await response.arrayBuffer(), { status: response.status })
    }, shelf, base)
    await keeper.manifest()
    tags = false
    server.set(manifestUrl, '{"build":2}')
    await keeper.manifest()
    server.set(manifestUrl, '{"build":3}')

    expect(text(await keeper.manifest())).toBe('{"build":3}')
    expect(ifNoneMatch(server.requests[2])).toBeFalsy()
  })

  it('keeps the newer manifest it found while looking for a missing file', async () => {
    const { keeper, server } = keeperWith({ 'manifest.json': '{"build":1}' })
    await keeper.manifest()
    server.set(manifestUrl, '{"build":2}')
    await expect(keeper.fileNamed('shard-9.9999999999.json')).rejects.toThrow()
    const refresh = server.requests.find(r => r.path.endsWith('manifest.json') && r !== server.requests[0])!
    const requestsSoFar = server.requests.length

    expect(text(await keeper.manifest())).toBe('{"build":2}')
    // the refresh took the new copy, so this check carries the new version's tag, not the old one
    expect(ifNoneMatch(server.requests[requestsSoFar])).toBeTruthy()
    expect(ifNoneMatch(server.requests[requestsSoFar])).not.toBe(ifNoneMatch(refresh))
  })

  it('shares one check between askers who ask at the same time', async () => {
    const { keeper, server } = keeperWith({ 'manifest.json': '{"build":1}' })

    const answers = await Promise.all([keeper.manifest(), keeper.manifest(), keeper.manifest()])

    expect(answers.map(text)).toEqual(['{"build":1}', '{"build":1}', '{"build":1}'])
    expect(server.requests).toHaveLength(1)
  })

  it('checks afresh for an asker who comes after the last check has finished', async () => {
    const { keeper, server } = keeperWith({ 'manifest.json': '{"build":1}' })
    await keeper.manifest()
    server.set(manifestUrl, '{"build":2}')

    expect(text(await keeper.manifest())).toBe('{"build":2}')
    expect(server.requests).toHaveLength(2)
  })

  it('does not share a failed check with later askers: they get to try again', async () => {
    const { keeper, server } = keeperWith({ 'manifest.json': '{"build":1}' })
    server.failures.set(manifestUrl, 'network')
    await expect(Promise.all([keeper.manifest(), keeper.manifest()])).rejects.toThrow()
    server.failures.delete(manifestUrl)

    expect(text(await keeper.manifest())).toBe('{"build":1}')
  })

  it('hands out the manifest it holds when the network is down, because an older manifest still points at real files', async () => {
    const { keeper, server } = keeperWith({ 'manifest.json': '{"build":1}' })
    await keeper.manifest()
    server.failures.set(manifestUrl, 'network')

    expect(text(await keeper.manifest())).toBe('{"build":1}')
  })

  it('does the same when the server answers with an error', async () => {
    const { keeper, server } = keeperWith({ 'manifest.json': '{"build":1}' })
    await keeper.manifest()
    server.failures.set(manifestUrl, 503)

    expect(text(await keeper.manifest())).toBe('{"build":1}')
  })

  it('has nothing to fall back on if it never held a manifest, so it fails', async () => {
    const { keeper, server } = keeperWith({ 'manifest.json': '{"build":1}' })
    server.failures.set(manifestUrl, 'network')

    await expect(keeper.manifest()).rejects.toThrow()
  })

  it('goes back to the newest manifest once the server is reachable again', async () => {
    const { keeper, server } = keeperWith({ 'manifest.json': '{"build":1}' })
    await keeper.manifest()
    server.failures.set(manifestUrl, 'network')
    await keeper.manifest()
    server.failures.delete(manifestUrl)
    server.set(manifestUrl, '{"build":2}')

    expect(text(await keeper.manifest())).toBe('{"build":2}')
  })
})
