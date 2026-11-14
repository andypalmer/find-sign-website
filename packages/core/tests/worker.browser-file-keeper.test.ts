import { describe, it, expect } from 'vitest'
import { FakeDataServer } from '@find-sign/test-helpers/fake-data-server.ts'
import { FakeIndexedDb } from '@find-sign/test-helpers/fake-indexeddb.ts'
import { fileKeeperForTheBrowser } from '../src/worker/browser-file-keeper.ts'

const base = 'https://data.example/index'
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

/**
 * A fetch as fussy as the browser's: the browser refuses to run `fetch` when it is called as a method of some
 * other object ("Illegal invocation"), so this refuses too.
 */
function fussyFetchOn (server: FakeDataServer) {
  return function (this: unknown, url: string, init?: RequestInit): Promise<Response> {
    if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation')
    return server.fetch(url, init)
  }
}

describe('the file keeper built for the browser', () => {
  it('works with a fetch that must not be called as a method of the keeper', async () => {
    const server = new FakeDataServer()
    server.set(`${base}/shard-0.aaaaaaaaaa.json`, 'the shard')
    server.set(`${base}/manifest.json`, '{"version":2,"indexes":{}}')
    const keeper = fileKeeperForTheBrowser({ baseUrl: base, fetch: fussyFetchOn(server), indexedDB: new FakeIndexedDb() })

    expect(text(await keeper.fileNamed('shard-0.aaaaaaaaaa.json'))).toBe('the shard')
    expect(text(await keeper.manifest())).toBe('{"version":2,"indexes":{}}')
  })

  it('keeps its files in the browser\'s database, so a keeper built later in the same browser has them', async () => {
    const server = new FakeDataServer()
    server.set(`${base}/shard-0.aaaaaaaaaa.json`, 'the shard')
    const browser = new FakeIndexedDb()
    const startWorker = () => fileKeeperForTheBrowser({ baseUrl: base, fetch: fussyFetchOn(server), indexedDB: browser })

    await startWorker().fileNamed('shard-0.aaaaaaaaaa.json')
    await startWorker().fileNamed('shard-0.aaaaaaaaaa.json')

    expect(server.requests).toHaveLength(1)
  })
})
