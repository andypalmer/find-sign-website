// Tests for the /sign/[index] and /sign/[index]/[id] loaders, which check the provider against SEARCH_INDEXES
// themselves (the provider param matcher can only check an id's shape)
import '@find-sign/test-helpers/test-env.ts'
import { expect, describe, it, beforeEach } from 'vitest'
import { isHttpError, isRedirect } from '@sveltejs/kit'
import { FakeDataServer } from '@find-sign/test-helpers/fake-data-server.ts'
import { IndexBase, publishBuiltIndexes } from '@find-sign/test-helpers/fixtures.ts'
import { load as loadIndexPage } from '../../src/routes/sign/[index=provider]/+page'
import { load as loadSignPage } from '../../src/routes/sign/[index=provider]/[id=filename]/+page'

let server: FakeDataServer

beforeEach(async () => {
  server = new FakeDataServer().install()
  await publishBuiltIndexes(server)
})

const thrown = (fn: () => unknown) => Promise.resolve().then(fn).catch(err => err)

describe('sign pages', () => {
  it('list a configured provider and load its entries', async () => {
    const page: any = await loadIndexPage({ params: { index: 'alpha' } } as any)
    expect(page.results.map((x: any) => x.id)).toEqual(['cat', 'dog', 'car'])
    const sign: any = await loadSignPage({ params: { index: 'alpha', id: 'dog' }, url: new URL('http://site.test/sign/alpha/dog') } as any)
    expect(sign.result.title).toBe('Dog')
  })

  it('redirects an old permalink (an alias) to the sign\'s readable id, keeping the query', async () => {
    const aliases = `${IndexBase}/alpha/aliases.json`
    server.set(aliases, { ...server.getJSON(aliases), entries: [null, ['dog1a', 'hound'], null] })
    const url = new URL('http://site.test/sign/alpha/dog1a?carousel0=1')
    const moved = await thrown(() => loadSignPage({ params: { index: 'alpha', id: 'dog1a' }, url } as any))
    expect(isRedirect(moved)).toBe(true)
    expect(moved).toMatchObject({ status: 308, location: '/sign/alpha/dog?carousel0=1' })
  })

  it('hands the index over to the page an old permalink redirects to, so it isn\'t fetched again', async () => {
    const aliases = `${IndexBase}/alpha/aliases.json`
    server.set(aliases, { ...server.getJSON(aliases), entries: [null, ['dog1a'], null] })
    // using up anything an earlier test's redirect handed over
    await loadSignPage({ params: { index: 'alpha', id: 'dog' }, url: new URL('http://site.test/sign/alpha/dog') } as any)
    await thrown(() => loadSignPage({ params: { index: 'alpha', id: 'dog1a' }, url: new URL('http://site.test/sign/alpha/dog1a') } as any))
    server.resetRequests()
    const sign: any = await loadSignPage({ params: { index: 'alpha', id: 'dog' }, url: new URL('http://site.test/sign/alpha/dog') } as any)
    expect(sign.result.title).toBe('Dog')
    expect(server.requestsTo(/alpha\/(meta|id|aliases)\.json/)).toEqual([])

    // an index rebuilt since the redirect: the page looks again
    await thrown(() => loadSignPage({ params: { index: 'alpha', id: 'dog1a' }, url: new URL('http://site.test/sign/alpha/dog1a') } as any))
    await publishBuiltIndexes(server)
    expect(((await loadSignPage({ params: { index: 'alpha', id: 'dog' }, url: new URL('http://site.test/sign/alpha/dog') } as any)) as any).result.title).toBe('Dog')

    // only once: the next load checks the index again
    server.resetRequests()
    await loadSignPage({ params: { index: 'alpha', id: 'dog' }, url: new URL('http://site.test/sign/alpha/dog') } as any)
    expect(server.requestsTo(/alpha\/meta\.json/)).toHaveLength(1)
  })

  it('still serves indexes built before aliases existed', async () => {
    const meta = server.getJSON(`${IndexBase}/alpha/meta.json`)
    delete meta.columns.aliases
    server.set(`${IndexBase}/alpha/meta.json`, meta)
    server.files.delete(`${IndexBase}/alpha/aliases.json`)
    const url = new URL('http://site.test/sign/alpha/dog')
    const sign: any = await loadSignPage({ params: { index: 'alpha', id: 'dog' }, url } as any)
    expect(sign.result.title).toBe('Dog')
    expect(isHttpError(await thrown(() => loadSignPage({ params: { index: 'alpha', id: 'dog1a' }, url } as any)), 404)).toBe(true)
  })

  it('404 for a provider that is not in SEARCH_INDEXES', async () => {
    expect(isHttpError(await thrown(() => loadIndexPage({ params: { index: 'gamma' } } as any)), 404)).toBe(true)
    expect(isHttpError(await thrown(() => loadSignPage({ params: { index: 'gamma', id: 'cat' } } as any)), 404)).toBe(true)
  })
})
