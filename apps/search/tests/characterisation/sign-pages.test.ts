// Tests for the /sign/[index] and /sign/[index]/[id] loaders, which check the provider against SEARCH_INDEXES
// themselves (the provider param matcher can only check an id's shape)
import '@find-sign/test-helpers/test-env.ts'
import { expect, describe, it, beforeAll } from 'vitest'
import { isHttpError } from '@sveltejs/kit'
import { FakeDataServer } from '@find-sign/test-helpers/fake-data-server.ts'
import { publishBuiltIndexes } from '@find-sign/test-helpers/fixtures.ts'
import { load as loadIndexPage } from '../../src/routes/sign/[index=provider]/+page'
import { load as loadSignPage } from '../../src/routes/sign/[index=provider]/[id=filename]/+page'

beforeAll(async () => {
  const server = new FakeDataServer().install()
  await publishBuiltIndexes(server)
})

const thrown = (fn: () => unknown) => Promise.resolve().then(fn).catch(err => err)

describe('sign pages', () => {
  it('list a configured provider and load its entries', async () => {
    const page: any = await loadIndexPage({ params: { index: 'alpha' } } as any)
    expect(page.results.map((x: any) => x.id)).toEqual(['cat', 'dog', 'car'])
    const sign: any = await loadSignPage({ params: { index: 'alpha', id: 'dog' } } as any)
    expect(sign.result.title).toBe('Dog')
  })

  it('404 for a provider that is not in SEARCH_INDEXES', async () => {
    expect(isHttpError(await thrown(() => loadIndexPage({ params: { index: 'gamma' } } as any)), 404)).toBe(true)
    expect(isHttpError(await thrown(() => loadSignPage({ params: { index: 'gamma', id: 'cat' } } as any)), 404)).toBe(true)
  })
})
