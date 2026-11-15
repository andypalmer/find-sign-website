import { describe, it, expect, vi } from 'vitest'
import { FakeDataServer } from '@find-sign/test-helpers/fake-data-server.ts'
import { FakeShelf } from '@find-sign/test-helpers/fake-shelf.ts'
import { FakeClock } from '@find-sign/test-helpers/fake-clock.ts'
import { FileKeeper, FileUnavailable } from '../src/worker/file-keeper.ts'
import { ManifestUnreadable } from '../src/worker/manifest-reader.ts'

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

  it('says why a file could not be fetched, with the status, so a missing file is not mistaken for a network failure', async () => {
    const { keeper, server } = keeperWith({ 'manifest.json': '{}' })
    const missing = await keeper.fileNamed('shard-1.aaaaaaaaaa.json').catch(error => error)
    expect(missing).toBeInstanceOf(FileUnavailable)
    expect(missing).toMatchObject({ fileName: 'shard-1.aaaaaaaaaa.json', status: 404 })
    expect(missing.message).toMatch(/shard-1/)

    server.failures.set(`${base}/shard-2.bbbbbbbbbb.json`, 500)
    expect(await keeper.fileNamed('shard-2.bbbbbbbbbb.json').catch(error => error)).toMatchObject({ status: 500 })

    server.failures.set(`${base}/shard-3.cccccccccc.json`, 'network')
    const noNetwork = await keeper.fileNamed('shard-3.cccccccccc.json').catch(error => error)
    expect(noNetwork).not.toBeInstanceOf(FileUnavailable)
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
  it('fetches it the first time, asking the network to check even if it has a copy', async () => {
    const { keeper, server } = keeperWith({ 'manifest.json': '{"build":1}' })

    expect(text(await keeper.manifest())).toBe('{"build":1}')
    expect(server.requests).toHaveLength(1)
    expect(server.requests[0].cache).toBe('no-cache')
  })

  it('asks the same way every time, with no headers of its own, so a browser needs no permission from the data server to ask', async () => {
    // a header like If-None-Match, sent by us to another site, makes the browser ask the data server's permission
    // first (a "preflight"); the browser checks its own copy with the server by itself when it is told "no-cache"
    const { keeper, server } = keeperWith({ 'manifest.json': '{"build":1}' })
    await keeper.manifest()
    await keeper.manifest()
    server.set(manifestUrl, '{"build":2}')
    await keeper.manifest()

    expect(server.requests).toHaveLength(3)
    for (const request of server.requests) {
      expect(request.cache).toBe('no-cache')
      expect(request.headers).toEqual({})
    }
  })

  it('takes the new manifest when the server has one', async () => {
    const { keeper, server } = keeperWith({ 'manifest.json': '{"build":1}' })
    await keeper.manifest()
    server.set(manifestUrl, '{"build":2}')

    expect(text(await keeper.manifest())).toBe('{"build":2}')
    expect(text(await keeper.manifest())).toBe('{"build":2}')
  })

  it('keeps its copy on the shelf, and nothing else about the manifest: no tag to remember', async () => {
    const { keeper, shelf } = keeperWith({ 'manifest.json': '{"build":1}' })
    await keeper.manifest()

    expect(await shelf.names()).toEqual(['manifest.json'])
  })

  it('still has its copy after the worker has been stopped and started again, for when the server can\'t be reached', async () => {
    const { keeper, server, shelf } = keeperWith({ 'manifest.json': '{"build":1}' })
    await keeper.manifest()
    server.failures.set(manifestUrl, 'network')
    const afterRestart = new FileKeeper((url, init) => server.fetch(url, init), shelf, base)

    expect(text(await afterRestart.manifest())).toBe('{"build":1}')
  })

  it('uses its copy when something along the way answers that nothing has changed', async () => {
    const { server, shelf } = keeperWith({ 'manifest.json': '{"build":1}' })
    let unchanged = false
    const keeper = new FileKeeper(async (url, init) => unchanged ? new Response(null, { status: 304 }) : await server.fetch(url, init), shelf, base)
    await keeper.manifest()
    unchanged = true

    expect(text(await keeper.manifest())).toBe('{"build":1}')
  })

  it('keeps the newer manifest it found while looking for a missing file', async () => {
    const { keeper, server } = keeperWith({ 'manifest.json': '{"build":1}' })
    await keeper.manifest()
    server.set(manifestUrl, '{"build":2}')
    await expect(keeper.fileNamed('shard-9.9999999999.json')).rejects.toThrow()

    expect(text(await keeper.manifest())).toBe('{"build":2}')
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

describe('the file keeper, following the manifest to the indexes', () => {
  const manifestUrl = `${base}/manifest.json`
  const alphaOne = { shardCount: 1, shards: ['shard-0.aaaaaaaaaa.json'], scans: ['scan-0.bbbbbbbbbb.json'] }
  const betaOne = { shardCount: 1, shards: ['shard-0.dddddddddd.json'], scans: ['scan-0.eeeeeeeeee.json'] }
  const alphaTwo = { ...alphaOne, shards: ['shard-0.ffffffffff.json'] }

  /** publish a build the way the pipeline will: the index manifests first, the top manifest last */
  function publish (server: FakeDataServer, indexes: Record<string, { name: string, contents: object }>) {
    for (const { name, contents } of Object.values(indexes)) server.set(`${base}/${name}`, contents)
    server.set(manifestUrl, { version: 2, indexes: Object.fromEntries(Object.entries(indexes).map(([index, { name }]) => [index, name])), vectors: [] })
  }
  const names = (server: FakeDataServer) => server.requests.map(r => r.path.split('/').pop())

  function keeperOn (server: FakeDataServer) {
    const shelf = new FakeShelf()
    return { shelf, keeper: new FileKeeper((url, init) => server.fetch(url, init), shelf, base) }
  }

  it('gives what each index is made of, as its own manifest says', async () => {
    const server = new FakeDataServer()
    publish(server, { alpha: { name: 'index-alpha.1111111111.json', contents: alphaOne }, beta: { name: 'index-beta.2222222222.json', contents: betaOne } })

    expect(await keeperOn(server).keeper.currentIndexes()).toEqual({ alpha: alphaOne, beta: betaOne })
  })

  it('needs only the manifest check the next time, when no index has changed', async () => {
    const server = new FakeDataServer()
    publish(server, { alpha: { name: 'index-alpha.1111111111.json', contents: alphaOne }, beta: { name: 'index-beta.2222222222.json', contents: betaOne } })
    const { keeper } = keeperOn(server)
    await keeper.currentIndexes()
    server.requests = []

    await keeper.currentIndexes()

    expect(names(server)).toEqual(['manifest.json'])
  })

  it('fetches only the index manifests whose names are new when a build changes one index', async () => {
    const server = new FakeDataServer()
    publish(server, { alpha: { name: 'index-alpha.1111111111.json', contents: alphaOne }, beta: { name: 'index-beta.2222222222.json', contents: betaOne } })
    const { keeper } = keeperOn(server)
    await keeper.currentIndexes()
    publish(server, { alpha: { name: 'index-alpha.3333333333.json', contents: alphaTwo }, beta: { name: 'index-beta.2222222222.json', contents: betaOne } })
    server.requests = []

    expect(await keeper.currentIndexes()).toEqual({ alpha: alphaTwo, beta: betaOne })
    expect(names(server).sort()).toEqual(['index-alpha.3333333333.json', 'manifest.json'])
  })

  it('works with no network at all once it has the manifests', async () => {
    const server = new FakeDataServer()
    publish(server, { alpha: { name: 'index-alpha.1111111111.json', contents: alphaOne } })
    const { keeper } = keeperOn(server)
    await keeper.currentIndexes()
    server.failures.set(manifestUrl, 'network')

    expect(await keeper.currentIndexes()).toEqual({ alpha: alphaOne })
  })

  it('passes on a manifest it cannot read, so the page can use its fallback', async () => {
    const server = new FakeDataServer()
    server.set(manifestUrl, { version: 9, indexes: {} })

    await expect(keeperOn(server).keeper.currentIndexes()).rejects.toThrow(ManifestUnreadable)
  })
})

describe('the file keeper, tidying up files that are out of date', () => {
  const manifestUrl = `${base}/manifest.json`
  const indexOne = { shardCount: 1, shards: ['shard-0.aaaaaaaaaa.json'], scans: ['scan-0.bbbbbbbbbb.json'] }
  const indexTwo = { ...indexOne, shards: ['shard-0.cccccccccc.json'] }
  const oldShard = 'shard-0.aaaaaaaaaa.json'
  const sharedScan = 'scan-0.bbbbbbbbbb.json'

  function publish (server: FakeDataServer, indexName: string, contents: typeof indexOne, vectors: string[] = []) {
    const name = `index-${indexName}.${contents.shards[0].slice(8, 18)}.json`
    server.set(`${base}/${name}`, contents)
    for (const file of [...contents.shards, ...contents.scans, ...vectors]) server.set(`${base}/${file}`, `bytes of ${file}`)
    server.set(manifestUrl, { version: 2, indexes: { [indexName]: name }, vectors })
  }

  /** a keeper that has fetched the old shard, then the build moves on to indexTwo, which no longer uses it */
  async function keeperAfterTheBuildMovesOn () {
    const server = new FakeDataServer()
    const clock = new FakeClock()
    const shelf = new FakeShelf()
    const keeperFor = () => new FileKeeper((url, init) => server.fetch(url, init), shelf, base, { clock })
    const keeper = keeperFor()
    publish(server, 'alpha', indexOne)
    await keeper.currentIndexes()
    await keeper.fileNamed(oldShard)
    publish(server, 'alpha', indexTwo)
    server.requests = []
    const timesFetched = () => server.requests.filter(r => r.path.endsWith(oldShard)).length
    return { server, clock, shelf, keeper, keeperFor, timesFetched }
  }

  /** whether the keeper still has the file, found by asking for it and seeing if it had to go to the server */
  async function stillKept (keeper: FileKeeper, timesFetched: () => number) {
    const before = timesFetched()
    await keeper.fileNamed(oldShard)
    return timesFetched() === before
  }

  it('keeps a file that is out of date until the grace period has passed', async () => {
    const { keeper, clock, timesFetched } = await keeperAfterTheBuildMovesOn()
    await keeper.tidy()
    clock.passDays(29)

    expect(await keeper.tidy()).toEqual([])
    expect(await stillKept(keeper, timesFetched)).toBe(true)
  })

  it('drops it once the grace period has passed, and says so', async () => {
    const { keeper, clock, timesFetched } = await keeperAfterTheBuildMovesOn()
    await keeper.tidy()
    clock.passDays(31)

    const dropped = await keeper.tidy()
    expect(dropped).toContain(oldShard)
    expect(dropped).not.toContain(sharedScan) // both builds use it, so it is still current
    expect(await stillKept(keeper, timesFetched)).toBe(false)
  })

  it('counts the grace period from when it first noticed the file was out of date, not from when it was fetched', async () => {
    const { keeper, clock } = await keeperAfterTheBuildMovesOn()
    clock.passDays(100)
    expect(await keeper.tidy()).toEqual([])
    clock.passDays(29)
    expect(await keeper.tidy()).toEqual([])
    clock.passDays(2)

    expect(await keeper.tidy()).toContain(oldShard)
  })

  it('never drops a file the current manifests mention, however long ago it was fetched', async () => {
    const { keeper, clock, server, timesFetched } = await keeperAfterTheBuildMovesOn()
    publish(server, 'alpha', indexOne)
    await keeper.tidy()
    clock.passDays(200)

    expect(await keeper.tidy()).toEqual([])
    expect(await stillKept(keeper, timesFetched)).toBe(true)
  })

  describe('with word vector files that every index shares', () => {
    const vectorFile = 'vectors-0.dddddddddd.lps'

    /** a keeper that has fetched a shared vector file named by manifest.json, with the build one step on */
    async function keeperHoldingASharedVectorFile () {
      const { server, clock, shelf, keeper, keeperFor } = await keeperAfterTheBuildMovesOn()
      publish(server, 'alpha', indexTwo, [vectorFile])
      await keeper.currentIndexes()
      await keeper.fileNamed(vectorFile)
      return { server, clock, shelf, keeper, keeperFor }
    }

    it('never drops a vector file that manifest.json names, though no index manifest does, however long ago it was fetched', async () => {
      const { keeper, clock, shelf } = await keeperHoldingASharedVectorFile()
      await keeper.tidy()
      clock.passDays(400)

      expect(await keeper.tidy()).not.toContain(vectorFile)
      expect(await shelf.names()).toContain(vectorFile)
    })

    it('drops it once manifest.json stops naming it and the grace period has passed', async () => {
      const { keeper, clock, server, shelf } = await keeperHoldingASharedVectorFile()
      publish(server, 'alpha', indexTwo) // the next build names no vector file
      await keeper.tidy()
      clock.passDays(31)

      expect(await keeper.tidy()).toContain(vectorFile)
      expect(await shelf.names()).not.toContain(vectorFile)
    })

    it('keeps it across a restart of the worker too', async () => {
      const { keeperFor, clock, shelf } = await keeperHoldingASharedVectorFile()
      await keeperFor().tidy()
      clock.passDays(400)

      expect(await keeperFor().tidy()).not.toContain(vectorFile)
      expect(await shelf.names()).toContain(vectorFile)
    })
  })

  it('starts the count again if a file becomes current and then goes out of date a second time', async () => {
    const { keeper, clock, server, timesFetched } = await keeperAfterTheBuildMovesOn()
    await keeper.tidy()
    clock.passDays(20)
    publish(server, 'alpha', indexOne)
    await keeper.tidy()
    publish(server, 'alpha', indexTwo)
    await keeper.tidy()
    clock.passDays(20)

    expect(await keeper.tidy()).toEqual([])
    expect(await stillKept(keeper, timesFetched)).toBe(true)
  })

  it('remembers when it noticed even after the worker has been stopped and started again', async () => {
    const { keeper, keeperFor, clock } = await keeperAfterTheBuildMovesOn()
    await keeper.tidy()
    clock.passDays(31)

    expect(await keeperFor().tidy()).toContain(oldShard)
  })

  it('keeps the manifest and its own notes, which no manifest mentions', async () => {
    const { keeper, clock, shelf } = await keeperAfterTheBuildMovesOn()
    await keeper.manifest()
    await keeper.tidy()
    clock.passDays(400)
    await keeper.tidy()

    expect(await shelf.names()).toEqual(expect.arrayContaining(['manifest.json']))
    expect(await keeper.manifest()).toBeTruthy()
  })

  it('drops nothing when it cannot read the manifest, because then it cannot tell what is current', async () => {
    const { keeper, clock, server, timesFetched } = await keeperAfterTheBuildMovesOn()
    await keeper.tidy()
    clock.passDays(400)
    server.set(manifestUrl, { version: 9, indexes: {} })

    await expect(keeper.tidy()).rejects.toThrow(ManifestUnreadable)
    expect(await stillKept(keeper, timesFetched)).toBe(true)
  })
})

describe('the file keeper, tidying by itself as searches go through it', () => {
  const manifestUrl = `${base}/manifest.json`
  const indexOne = { shardCount: 1, shards: ['shard-0.aaaaaaaaaa.json'], scans: ['scan-0.bbbbbbbbbb.json'] }
  const indexTwo = { ...indexOne, shards: ['shard-0.cccccccccc.json'] }
  const oldShard = 'shard-0.aaaaaaaaaa.json'

  function publish (server: FakeDataServer, contents: typeof indexOne) {
    const name = `index-alpha.${contents.shards[0].slice(8, 18)}.json`
    server.set(`${base}/${name}`, contents)
    for (const file of [...contents.shards, ...contents.scans]) server.set(`${base}/${file}`, `bytes of ${file}`)
    server.set(manifestUrl, { version: 2, indexes: { alpha: name }, vectors: [] })
  }

  /** a keeper that has seen build one and fetched its shard; the data server then moves on to build two */
  async function keeperWhenTheBuildMovesOn () {
    const server = new FakeDataServer()
    const clock = new FakeClock()
    const shelf = new FakeShelf()
    const keeper = new FileKeeper((url, init) => server.fetch(url, init), shelf, base, { clock })
    publish(server, indexOne)
    await keeper.currentIndexes()
    await keeper.fileNamed(oldShard)
    publish(server, indexTwo)
    const tidyChecks = vi.spyOn(shelf, 'names') // tidying always lists the shelf
    const oldShardFetches = () => server.requests.filter(r => r.path.endsWith(oldShard)).length
    return { server, clock, shelf, keeper, tidyChecks, oldShardFetches }
  }

  async function stillKept (keeper: FileKeeper, oldShardFetches: () => number) {
    const before = oldShardFetches()
    await keeper.fileNamed(oldShard)
    return oldShardFetches() === before
  }

  it('starts the wait when a search sees a new manifest, then drops the files once the wait is over, though the manifest has not changed again', async () => {
    const { keeper, clock, oldShardFetches } = await keeperWhenTheBuildMovesOn()
    await keeper.currentIndexes()
    clock.passDays(31)
    await keeper.currentIndexes()

    expect(await stillKept(keeper, oldShardFetches)).toBe(false)
  })

  it('does not tidy again while the manifest is the same and no waiting file is ready to go', async () => {
    const { keeper, clock, tidyChecks } = await keeperWhenTheBuildMovesOn()
    await keeper.currentIndexes()
    tidyChecks.mockClear()
    clock.passDays(10)

    await keeper.currentIndexes()
    await keeper.currentIndexes()

    expect(tidyChecks).not.toHaveBeenCalled()
  })

  it('keeps a waiting file until its wait is over, however many searches go through', async () => {
    const { keeper, clock, oldShardFetches } = await keeperWhenTheBuildMovesOn()
    await keeper.currentIndexes()
    clock.passDays(29)
    await keeper.currentIndexes()
    expect(await stillKept(keeper, oldShardFetches)).toBe(true)

    clock.passDays(2)
    await keeper.currentIndexes()
    expect(await stillKept(keeper, oldShardFetches)).toBe(false)
  })

  it('does not count an explicit tidy as a reason to tidy again for the same manifest', async () => {
    const { keeper, tidyChecks } = await keeperWhenTheBuildMovesOn()
    await keeper.tidy()
    tidyChecks.mockClear()

    await keeper.currentIndexes()

    expect(tidyChecks).not.toHaveBeenCalled()
  })

  it('still answers the search when the tidying fails, and tries the tidying again on the next search', async () => {
    const { keeper, clock, shelf } = await keeperWhenTheBuildMovesOn()
    await keeper.currentIndexes()
    clock.passDays(31)
    const forget = vi.spyOn(shelf, 'forget').mockRejectedValue(new Error('storage is full of sorrow'))

    expect(Object.keys(await keeper.currentIndexes())).toEqual(['alpha'])
    await keeper.currentIndexes()

    expect(forget.mock.calls.length).toBeGreaterThan(1)
  })
})

describe('the file keeper, when the browser has emptied its storage', () => {
  const manifestUrl = `${base}/manifest.json`
  const indexName = 'index-alpha.1111111111.json'
  const shardName = 'shard-0.aaaaaaaaaa.json'
  const scanName = 'scan-0.bbbbbbbbbb.json'

  function publishBuild (server: FakeDataServer) {
    server.set(`${base}/${indexName}`, { shardCount: 1, shards: [shardName], scans: [scanName] })
    server.set(`${base}/${shardName}`, 'the shard')
    server.set(`${base}/${scanName}`, 'the scan')
    server.set(manifestUrl, { version: 2, indexes: { alpha: indexName }, vectors: [] })
  }
  const requestedNames = (server: FakeDataServer) => server.requests.map(r => r.path.split('/').pop())

  it('fetches what it needs again, and gives the same answers, when the shelf comes back empty mid-session', async () => {
    const server = new FakeDataServer()
    publishBuild(server)
    const shelf = new FakeShelf()
    const keeper = new FileKeeper((url, init) => server.fetch(url, init), shelf, base)
    const before = await keeper.currentIndexes()
    await keeper.fileNamed(shardName)

    shelf.files.clear()
    server.requests = []

    expect(await keeper.currentIndexes()).toEqual(before)
    expect(text(await keeper.fileNamed(shardName))).toBe('the shard')
    expect(requestedNames(server)).toEqual(expect.arrayContaining([indexName, shardName]))
  })

  it('starts cleanly from an empty shelf after a restart, with the server reachable', async () => {
    const server = new FakeDataServer()
    publishBuild(server)
    const keeper = new FileKeeper((url, init) => server.fetch(url, init), new FakeShelf(), base)

    expect(Object.keys(await keeper.currentIndexes())).toEqual(['alpha'])
    expect(text(await keeper.fileNamed(scanName))).toBe('the scan')
  })

  it('tidies an empty shelf without throwing away anything, and keeps working afterwards', async () => {
    const server = new FakeDataServer()
    publishBuild(server)
    const keeper = new FileKeeper((url, init) => server.fetch(url, init), new FakeShelf(), base)

    await expect(keeper.tidy()).resolves.toEqual([])
    expect(text(await keeper.fileNamed(shardName))).toBe('the shard')
  })
})

describe('the file keeper, under a limit on how much it keeps', () => {
  const manifestUrl = `${base}/manifest.json`
  const indexName = 'index-alpha.1111111111.json'
  const shard = 'shard-0.aaaaaaaaaa.json'
  const megabyte = 1_000_000

  function publishBuild (server: FakeDataServer) {
    server.set(`${base}/${indexName}`, { shardCount: 1, shards: [shard], scans: [] })
    server.set(`${base}/${shard}`, 'the shard')
    server.set(manifestUrl, { version: 2, indexes: { alpha: indexName }, vectors: [] })
  }

  /** a keeper on a shelf with the build's files current, and two files out of date that are each a megabyte */
  function keeperWithOldFiles (maxKeptBytes: number) {
    const server = new FakeDataServer()
    publishBuild(server)
    const shelf = new FakeShelf()
    const clock = new FakeClock()
    const keeper = new FileKeeper((url, init) => server.fetch(url, init), shelf, base, { clock, maxKeptBytes })
    return { server, shelf, clock, keeper }
  }

  it('drops the oldest out-of-date file once the kept files are over the limit, even within the grace period, and keeps the newer one', async () => {
    const { shelf, clock, keeper } = keeperWithOldFiles(1.5 * megabyte)
    await shelf.remember('old-a.1111111111.json', new Uint8Array(megabyte))
    expect(await keeper.tidy()).toEqual([])

    clock.passDays(1)
    await shelf.remember('old-b.2222222222.json', new Uint8Array(megabyte))
    expect(await keeper.tidy()).toEqual(['old-a.1111111111.json'])
    expect(await shelf.names()).toContain('old-b.2222222222.json')
    expect(await shelf.names()).not.toContain('old-a.1111111111.json')
  })

  it('stops dropping as soon as the kept files are under the limit', async () => {
    const { shelf, clock, keeper } = keeperWithOldFiles(2.5 * megabyte)
    await shelf.remember('old-a.1111111111.json', new Uint8Array(megabyte))
    await keeper.tidy()
    clock.passDays(1)
    await shelf.remember('old-b.2222222222.json', new Uint8Array(megabyte))
    await shelf.remember('old-c.3333333333.json', new Uint8Array(megabyte))
    clock.passDays(1)

    const dropped = await keeper.tidy()

    expect(dropped).toEqual(['old-a.1111111111.json'])
    expect(await shelf.names()).toEqual(expect.arrayContaining(['old-b.2222222222.json', 'old-c.3333333333.json']))
  })

  it('never drops a file that a current manifest names, even when those files alone are over the limit', async () => {
    const { server, shelf, keeper } = keeperWithOldFiles(10)
    await keeper.currentIndexes()
    await keeper.fileNamed(shard)

    expect(await keeper.tidy()).toEqual([])
    expect(await shelf.names()).toEqual(expect.arrayContaining([indexName, shard]))
    expect(text(await keeper.fileNamed(shard))).toBe('the shard')
    expect(server.requests.filter(r => r.path.endsWith(shard))).toHaveLength(1)
  })
})
