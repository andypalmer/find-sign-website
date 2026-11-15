import { describe, it, expect } from 'vitest'
import { FakeDataServer } from '@find-sign/test-helpers/fake-data-server.ts'
import { FakeIndexedDb } from '@find-sign/test-helpers/fake-indexeddb.ts'
import { FakeShelf } from '@find-sign/test-helpers/fake-shelf.ts'
import { FileKeeper, type IRememberFilesByName } from '../src/worker/file-keeper.ts'
import { IndexedDbShelf, type OpensDatabases } from '../src/worker/indexeddb-shelf.ts'

const bytesOf = (text: string) => new TextEncoder().encode(text)
const textOf = (bytes: Uint8Array | undefined) => bytes === undefined ? undefined : new TextDecoder().decode(bytes)

// Every shelf makes the same promises, so the same tests run on each; that also keeps the fake honest.
describe.each<[string, () => IRememberFilesByName]>([
  ['the pretend shelf', () => new FakeShelf()],
  ['the IndexedDB shelf', () => new IndexedDbShelf(new FakeIndexedDb(), 'find-sign-index')]
])('%s', (_, newShelf) => {
  it('gives back the bytes it was given, under the name it was given them', async () => {
    const shelf = newShelf()
    await shelf.remember('shard-0.aaaaaaaaaa.json', bytesOf('one'))
    await shelf.remember('shard-1.bbbbbbbbbb.json', bytesOf('two'))

    expect(textOf(await shelf.recall('shard-0.aaaaaaaaaa.json'))).toBe('one')
    expect(textOf(await shelf.recall('shard-1.bbbbbbbbbb.json'))).toBe('two')
  })

  it('gives back real bytes, not some other kind of thing', async () => {
    const shelf = newShelf()
    await shelf.remember('a', new Uint8Array([0, 1, 254, 255]))

    expect(await shelf.recall('a')).toBeInstanceOf(Uint8Array)
    expect([...(await shelf.recall('a'))!]).toEqual([0, 1, 254, 255])
  })

  it('has nothing under a name it was never given', async () => {
    expect(await newShelf().recall('nothing-here')).toBeUndefined()
  })

  it('replaces what was there when given new bytes under the same name', async () => {
    const shelf = newShelf()
    await shelf.remember('manifest.json', bytesOf('build 1'))
    await shelf.remember('manifest.json', bytesOf('build 2'))

    expect(textOf(await shelf.recall('manifest.json'))).toBe('build 2')
    expect(await shelf.names()).toEqual(['manifest.json'])
  })

  it('lists the name of everything on it', async () => {
    const shelf = newShelf()
    expect(await shelf.names()).toEqual([])
    await shelf.remember('b', bytesOf('1'))
    await shelf.remember('a', bytesOf('2'))

    expect([...await shelf.names()].sort()).toEqual(['a', 'b'])
  })

  it('throws a file away when told to, and only that file', async () => {
    const shelf = newShelf()
    await shelf.remember('a', bytesOf('1'))
    await shelf.remember('b', bytesOf('2'))
    await shelf.forget('a')

    expect(await shelf.recall('a')).toBeUndefined()
    expect(textOf(await shelf.recall('b'))).toBe('2')
    expect(await shelf.names()).toEqual(['b'])
  })

  it('does nothing when told to throw away a file it does not have', async () => {
    const shelf = newShelf()
    await shelf.remember('a', bytesOf('1'))
    await shelf.forget('not-here')

    expect(await shelf.names()).toEqual(['a'])
  })
})

describe('the IndexedDB shelf, which a browser keeps between visits', () => {
  it('still has the files when a new shelf is opened on the same database, as after the worker is stopped and started', async () => {
    const browser = new FakeIndexedDb()
    await new IndexedDbShelf(browser, 'find-sign-index').remember('a', bytesOf('kept'))

    expect(textOf(await new IndexedDbShelf(browser, 'find-sign-index').recall('a'))).toBe('kept')
  })

  it('keeps one database apart from another in the same browser', async () => {
    const browser = new FakeIndexedDb()
    await new IndexedDbShelf(browser, 'one').remember('a', bytesOf('in one'))

    expect(await new IndexedDbShelf(browser, 'two').recall('a')).toBeUndefined()
    expect(await new IndexedDbShelf(browser, 'two').names()).toEqual([])
  })

  it('copes with several things being asked at once, as when searches overlap', async () => {
    const shelf = new IndexedDbShelf(new FakeIndexedDb(), 'find-sign-index')
    const names = Array.from({ length: 20 }, (_, i) => `file-${i}`)

    await Promise.all(names.map(name => shelf.remember(name, bytesOf(name))))
    const recalled = await Promise.all(names.map(name => shelf.recall(name)))

    expect(recalled.map(textOf)).toEqual(names)
  })

  it('tells the asker when the browser will not open the database, and tries again next time', async () => {
    const working = new FakeIndexedDb()
    let refuse = true
    const browser: OpensDatabases = {
      open (name, version) {
        if (refuse) throw new Error('the browser says no')
        return working.open(name, version)
      }
    }
    const shelf = new IndexedDbShelf(browser, 'find-sign-index')

    await expect(shelf.remember('a', bytesOf('1'))).rejects.toThrow('the browser says no')
    refuse = false
    await shelf.remember('a', bytesOf('1'))

    expect(textOf(await shelf.recall('a'))).toBe('1')
  })
})

describe('the IndexedDB shelf, when the database is upgraded from elsewhere', () => {
  it('lets another connection upgrade the database, and carries on working afterwards', async () => {
    const browser = new FakeIndexedDb()
    const shelf = new IndexedDbShelf(browser, 'find-sign-index')
    await shelf.remember('a', bytesOf('kept'))

    // a newer build of the site opens the same database at a higher version; we must not stand in its way
    const upgrade = new Promise<string>(resolve => {
      const request = browser.open('find-sign-index', 2)
      request.onsuccess = () => { request.result.close(); resolve('upgraded') }
      request.onblocked = () => resolve('blocked')
    })

    expect(await upgrade).toBe('upgraded')
    expect(textOf(await shelf.recall('a'))).toBe('kept')
    await shelf.remember('b', bytesOf('after the upgrade'))
    expect([...await shelf.names()].sort()).toEqual(['a', 'b'])
  })
})

describe('the file keeper on the IndexedDB shelf', () => {
  it('does not fetch a file again after the worker has been stopped and started again', async () => {
    const base = 'https://data.example/index'
    const server = new FakeDataServer()
    server.set(`${base}/shard-0.aaaaaaaaaa.json`, 'the shard')
    const browser = new FakeIndexedDb()
    const startWorker = () => new FileKeeper((url, init) => server.fetch(url, init), new IndexedDbShelf(browser, 'find-sign-index'), base)

    await startWorker().fileNamed('shard-0.aaaaaaaaaa.json')
    const afterRestart = await startWorker().fileNamed('shard-0.aaaaaaaaaa.json')

    expect(textOf(afterRestart)).toBe('the shard')
    expect(server.requests).toHaveLength(1)
  })
})
