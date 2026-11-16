import '@find-sign/test-helpers/test-env.ts'
import { describe, expect, it } from 'vitest'
import { FakeDataServer } from '@find-sign/test-helpers/fake-data-server.ts'
import { makeBookshelf } from '../src/search/bookshelf-library.ts'
import { search, useTheBookshelf } from '../src/search/search.ts'

// no version 2 index on this data server (no manifest.json): the bookshelf must hand the search to version 1
const base = 'https://data.example/index'

describe('search, when the data server has no version 2 index', () => {
  it('answers with the version 1 search', async () => {
    const server = new FakeDataServer().install()
    const fromVersion1 = { results: [{ id: 'from-version-1' }], totalResults: 1 } as never
    let asked: string | undefined
    useTheBookshelf(makeBookshelf({
      baseUrl: base,
      indexes: ['alpha'],
      fetch: (url, init) => server.fetch(url, init),
      fallbackSearch: async (query) => { asked = query; return fromVersion1 }
    }))

    expect(await search('cat', 0, 10)).toBe(fromVersion1)
    expect(asked).toBe('cat')
  })
})
