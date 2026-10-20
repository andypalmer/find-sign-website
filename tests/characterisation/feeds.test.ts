// Characterisation tests for the discovery feed, the homepage feed merge, and random sign selection.
import '../helpers/test-env'
import { NewsRSS } from '../helpers/test-env'
import { expect, describe, it, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { FakeDataServer } from '../helpers/fake-data-server'
import { publishBuiltIndexes } from '../helpers/fixtures'
import { getUpdatesFeed } from '../../src/routes/feeds/_read-discovery-feed'
import { getRandomSigns, blockedTags } from '../../src/lib/search/random'

let server: FakeDataServer
const url = new URL('http://site.test/feeds/discovery.json')

beforeAll(async () => {
  server = new FakeDataServer().install()
  await publishBuiltIndexes(server)
})

beforeEach(() => server.resetRequests())
afterEach(() => { vi.restoreAllMocks() })

describe('getUpdatesFeed()', () => {
  it('lists entries newest first, skipping entries without a timestamp', async () => {
    const feed = await getUpdatesFeed({ url })
    expect(feed.items.map(x => x.id)).toEqual(['beta:kitten', 'alpha:cat', 'alpha:car', 'alpha:dog'])
  })

  it('produces JSON Feed 1.1 items, using the provider as author when there is none', async () => {
    const feed = await getUpdatesFeed({ url })
    expect(feed).toMatchObject({
      version: 'https://jsonfeed.org/version/1.1',
      title: 'Sign Language Updates',
      home_page_url: 'http://site.test/',
      feed_url: 'http://site.test/feeds/discovery.json?page=0',
      next_url: 'http://site.test/feeds/discovery.json?page=1',
    })
    const kitten = feed.items[0]
    expect(kitten).toEqual({
      id: 'beta:kitten',
      title: 'Beta Community shared: Kitten',
      url: 'http://site.test/sign/beta/kitten',
      external_url: 'https://beta.test/kitten',
      authors: [{ name: 'Beta Community', url: 'https://beta.test/' }],
      date_published: new Date(4000).toISOString(),
      content_text: 'Line one\nLine two',
      attachments: [
        { url: 'http://data.test/collections/encoded-search-data/raw/kitten-media/kitten-0.mp4', mime_type: 'video/mp4', title: 'Video 1', size_in_bytes: 100, duration_in_seconds: 2 },
        { url: 'http://data.test/collections/encoded-search-data/raw/kitten-media/kitten-0.webm', mime_type: 'video/webm', title: 'Video 1', size_in_bytes: 50, duration_in_seconds: 2 },
      ],
    })
    const car = feed.items.find(x => x.id === 'alpha:car')
    expect(car!.authors).toEqual([{ name: 'Phoenix', url: 'https://alpha.test/phoenix', avatar: undefined }])
  })

  it('adds __fs_verb and __fs_words when extended', async () => {
    const feed = await getUpdatesFeed({ url, extended: true })
    expect(feed.items[0]).toMatchObject({ __fs_verb: 'shared', __fs_words: ['Kitten'] })
  })

  it('paginates, and only stops offering next_url once a page comes back empty', async () => {
    const page1 = await getUpdatesFeed({ url, page: 1, length: 3 })
    expect(page1.items.map(x => x.id)).toEqual(['alpha:dog'])
    expect(page1.next_url).toBe('http://site.test/feeds/discovery.json?page=2')
    const page2 = await getUpdatesFeed({ url, page: 2, length: 3 })
    expect(page2.items).toEqual([])
    expect(page2.next_url).toBeNull()
  })

  it('loads the timestamp column of every index, then one shard per item', async () => {
    await getUpdatesFeed({ url, length: 1 })
    expect(server.requests.map(r => r.path.split('/').slice(-2).join('/')).sort()).toEqual([
      'alpha/meta.json', 'alpha/timestamp.json', 'beta/meta.json', 'beta/shard-0.json', 'beta/timestamp.json',
    ])
  })
})

describe('homepage load', () => {
  const rss = (items: [string, string][]) => `<?xml version="1.0"?><rss><channel><title>News</title>${
    items.map(([title, date]) => `<item><title>${title}</title><link>https://news.test/${title}</link><pubDate>${date}</pubDate></item>`).join('')
  }</channel></rss>`

  async function freshHomepageLoad () {
    vi.resetModules()
    return (await import('../../src/routes/+page.server')).load as any
  }

  it('merges sign updates and blog posts into one list, oldest first', async () => {
    server.set(NewsRSS, rss([['post-a', 'Thu, 01 Jan 1970 00:00:02 GMT'], ['post-b', 'Thu, 01 Jan 1970 00:00:05 GMT']]))
    const load = await freshHomepageLoad()
    const { feed, automated } = await load({ url: new URL('http://site.test/'), setHeaders: () => {} })
    expect(automated).toBe(false)
    expect(feed.map((x: any) => `${x.verb}:${x.title}`)).toEqual([
      'documented:dog', 'documented:car', 'blogged:post-a', 'documented:cat', 'shared:Kitten', 'blogged:post-b',
    ])
    expect(feed.find((x: any) => x.verb === 'blogged')).toEqual({
      author: { name: 'Find Sign' }, verb: 'blogged', title: 'post-a',
      date: new Date(2000).toISOString(), remoteURL: 'https://news.test/post-a',
    })
    expect(feed[0]).toEqual({
      author: { name: 'Alpha Dictionary', url: 'https://alpha.test/' }, verb: 'documented', title: 'dog',
      date: new Date(1000).toISOString(), cacheURL: 'http://site.test/sign/alpha/dog', remoteURL: 'https://alpha.test/dog',
    })
  })

  it.each([
    // QUIRK: readFeed never checks response.ok, so an http error parses as an empty feed, silently
    [500, false],
    ['network', true],
  ] as const)('still renders sign updates when the blog feed fails (%s), logging: %s', async (failure, logged) => {
    server.failures.set(NewsRSS, failure)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const load = await freshHomepageLoad()
      const { feed } = await load({ url: new URL('http://site.test/'), setHeaders: () => {} })
      expect(feed).toHaveLength(4)
      expect(feed.every((x: any) => x.verb !== 'blogged')).toBe(true)
      expect((console.error as any).mock.calls.length > 0).toBe(logged)
    } finally {
      server.failures.delete(NewsRSS)
    }
  })

  it('serves the previous result while a refresh is in flight (immediateResponseCache)', async () => {
    server.set(NewsRSS, rss([]))
    const load = await freshHomepageLoad()
    const event = { url: new URL('http://site.test/'), setHeaders: () => {} }
    const first = await load(event)
    server.set(NewsRSS, rss([['late-post', 'Thu, 01 Jan 2099 00:00:00 GMT']]))
    const second = await load(event)
    expect(second).toBe(first) // stale: the refresh started by this call is not awaited
    await new Promise(resolve => setTimeout(resolve, 50))
    const third = await load(event)
    expect(third.feed.at(-1).title).toBe('late-post')
  })
})

describe('getRandomSigns()', () => {
  it('never picks entries carrying a blocked tag', async () => {
    expect(blockedTags).toEqual(['signpedia', 'invented', 'lexis.crude', 'semantic.sexuality', 'lexis.fingerspell'])
    // pool after blocking car (lexis.crude) and kitten (invented): cat, dog, red-truck
    const picks = []
    for (const r of [0, 0.4, 0.99]) {
      vi.spyOn(Math, 'random').mockReturnValue(r)
      picks.push(...await getRandomSigns(1))
    }
    expect(picks).toEqual([
      { index: 'alpha', id: 'cat' },
      { index: 'alpha', id: 'dog' },
      { index: 'beta', id: 'red-truck' },
    ])
  })

  it('may return the same sign twice', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(await getRandomSigns(2)).toEqual([{ index: 'alpha', id: 'cat' }, { index: 'alpha', id: 'cat' }])
  })
})
