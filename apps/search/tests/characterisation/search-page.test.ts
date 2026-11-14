// The search page's loader, run the way the server runs it (it runs in the browser too, where the service worker
// can answer; the server has none, so it always searches directly), with the service worker switched on.
import '@find-sign/test-helpers/test-env.ts'
import { beforeEach, describe, expect, it } from 'vitest'
import { isRedirect } from '@sveltejs/kit'
import { FakeDataServer } from '@find-sign/test-helpers/fake-data-server.ts'
import { publishBuiltIndexes } from '@find-sign/test-helpers/fixtures.ts'

// the setting is read when the page's search is made, so it has to be on before the loader is loaded
process.env.SERVICE_WORKER = 'on'
const { load } = await import('../../src/routes/search/+page.ts')

let server: FakeDataServer
beforeEach(async () => {
  server = new FakeDataServer().install()
  await publishBuiltIndexes(server)
})

const event = (query: string) => ({ url: new URL(`http://site.test/search?query=${encodeURIComponent(query)}`), fetch: globalThis.fetch }) as any

describe('the search page on the server, with the service worker switched on', () => {
  it('searches directly and gives its results, since the server has no service worker to ask', async () => {
    const page: any = await load(event('cat'))
    expect(page.results.map((result: any) => result.id)).toEqual(['cat', 'kitten', 'dog', 'red-truck', 'car'])
    expect(page.query).toBe('cat')
  })

  it('still sends an empty search home', async () => {
    const thrown = await Promise.resolve(load(event('  '))).catch(error => error)
    expect(isRedirect(thrown)).toBe(true)
  })
})
