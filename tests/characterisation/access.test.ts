// Characterisation tests for sessions and access control on admin / automation routes.
// Tests labelled GAP pin current behaviour that is probably unintended - change them deliberately.
import '../helpers/test-env'
import { AutomationKey, DataBase, passkeyKeyPair } from '../helpers/test-env'
import { expect, describe, it, beforeEach, vi } from 'vitest'
import { FakeDataServer } from '../helpers/fake-data-server'
import { publishSearchData, publishVectorLibrary } from '../helpers/fixtures'
import { encodeHex, decodeUTF8, sign } from 'tweetnacl-ts'
import { isRedirect } from '@sveltejs/kit'
import { handle } from '../../src/hooks.server'
import { createUser, getUser } from '../../src/lib/models/user'
import { writeAuditLog } from '../../src/lib/models/audit-log'
import * as adminHome from '../../src/routes/admin/+page.server'
import * as adminIndexes from '../../src/routes/admin/indexes/+page.server'
import * as adminOverrides from '../../src/routes/admin/overrides/+page.server'
import * as adminOverrideEndpoint from '../../src/routes/admin/overrides/[provider=provider]:[id=filename]/+server'
import * as adminUsers from '../../src/routes/admin/users/+page.server'
import * as adminUser from '../../src/routes/admin/users/[user]/+page.server'
import * as adminUserEndpoint from '../../src/routes/admin/users/[user]/+server'
import * as auditLog from '../../src/routes/admin/audit-log/+page.server'
import * as auditFeed from '../../src/routes/admin/audit-log/feed.json/+server'
import * as validate from '../../src/routes/admin/indexes/[provider]/validate/+server'
import * as automationBuild from '../../src/routes/automation/build-index/[provider=provider]/+server'

let server: FakeDataServer

beforeEach(async () => {
  server = new FakeDataServer().install()
  await createUser('viewer', { authenticators: { cred: { counter: 1 } } })
  await createUser('indexer', { powers: ['edit-index'] })
  await createUser('admin', { powers: ['edit-users'] })
  server.resetRequests()
})

function token (session: object) {
  return encodeHex(sign(decodeUTF8(JSON.stringify(session)), passkeyKeyPair.secretKey))
}

function event ({ cookie = '', url = 'http://site.test/admin', username = undefined, params = {}, body = undefined, method = 'GET' } = {}) {
  return {
    url: new URL(url),
    params,
    locals: username ? { username } : {},
    getClientAddress: () => '127.0.0.1',
    setHeaders: () => {},
    request: new Request(url, { method, headers: { cookie }, body: body && JSON.stringify(body) }),
  } as any
}

const asUser = (username: string, extra = {}) => event({ username, ...extra })

describe('session cookie (hooks.server.ts handle)', () => {
  async function localsFor (cookie: string) {
    const e = event({ cookie })
    vi.spyOn(console, 'info').mockImplementation(() => {})
    await handle({ event: e, resolve: async () => new Response('') })
    return e.locals
  }

  it('sets locals from a token signed with VITE_PASSKEY_CHALLENGE_SECRET', async () => {
    const ts = Math.round(Date.now() / 1000)
    expect(await localsFor(`token=${token({ username: 'viewer', ts })}`)).toEqual({ username: 'viewer', ts })
  })

  it('ignores missing, forged, malformed and day-old tokens', async () => {
    const forged = encodeHex(sign(decodeUTF8(JSON.stringify({ username: 'admin', ts: Date.now() / 1000 })), new Uint8Array(64)))
    expect(await localsFor('')).toEqual({})
    expect(await localsFor(`token=${forged}`)).toEqual({})
    expect(await localsFor(`token=${token({ username: 'admin' })}`)).toEqual({})
    expect(await localsFor(`token=${token({ username: 'admin', ts: Date.now() / 1000 - 86401 })}`)).toEqual({})
  })
})

describe('login required pages', () => {
  it('redirects logged out visitors to the login page', async () => {
    for (const load of [adminHome.load, adminIndexes.load, adminUsers.load] as any[]) {
      const thrown = await load(event()).catch(err => err)
      expect(isRedirect(thrown)).toBe(true)
      expect(thrown).toMatchObject({ status: 307, location: '/admin/login' })
    }
  })

  it('admin/indexes requires the edit-index power', async () => {
    await expect(adminIndexes.load(asUser('viewer'))).rejects.toThrow('You don’t have the right to edit search index')
    expect(await adminIndexes.load(asUser('indexer'))).toEqual({ availableIndexes: ['alpha', 'beta'] })
  })

  it('GAP: any logged in user can list overrides and users, and read any user record', async () => {
    expect(await adminOverrides.load(asUser('viewer'))).toEqual({ overrides: [] })
    expect(await adminUsers.load(asUser('viewer'))).toEqual({ usernames: ['admin', 'indexer', 'viewer'] })
    const other: any = await adminUser.load(asUser('viewer', { params: { user: 'admin' } }))
    expect(other).toMatchObject({ username: 'admin', canEdit: false, user: { powers: ['edit-users'] } })
  })

  it('GAP: an edit-users holder can grant themselves any power, including "everything"', async () => {
    const response = await adminUserEndpoint.PUT(asUser('admin', { params: { user: 'admin' }, method: 'PUT', body: { powers: ['everything'] } }))
    expect((await getUser('admin')).powers).toEqual(['everything'])
    // responds with the updated user, which the edit page reads back
    expect(await response.json()).toMatchObject({ powers: ['everything'] })
  })

  it('saving an override waits for the write, then responds 204', async () => {
    await publishVectorLibrary(server)
    publishSearchData(server)
    const response = await adminOverrideEndpoint.POST(asUser('indexer', {
      params: { provider: 'alpha', id: 'cat' }, url: 'http://site.test/admin/overrides/alpha:cat', method: 'POST', body: { title: 'New' },
    }))
    expect(response.status).toBe(204)
    expect(server.getJSON(`${DataBase}overrides/alpha:cat.json`)).toEqual({ title: 'New' })
  })

  it('GAP: index validation only requires a login, not a power', async () => {
    publishSearchData(server)
    const response = await validate.POST(asUser('viewer', { params: { provider: 'alpha' }, method: 'POST' }))
    expect(response.status).toBe(200)
  })
})

describe('audit log pages', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    for (let i = 1; i <= 3; i++) {
      vi.setSystemTime(i * 1000)
      await writeAuditLog('admin', 'edit-user', `change ${i}`)
    }
    vi.useRealTimers()
  })

  it('GAP: the audit log page needs no login', async () => {
    const page: any = await auditLog.load(event({ url: 'http://site.test/admin/audit-log' }))
    expect(page.pageEntries.map(x => x.message)).toEqual(['change 1', 'change 2', 'change 3'])
    expect(page).toMatchObject({ currentPage: 0, totalPages: 1 })
  })

  it('GAP + QUIRK: the audit feed needs no login, and lists the OLDEST 50 entries', async () => {
    const response = await auditFeed.GET(event({ url: 'http://site.test/admin/audit-log/feed.json' }))
    const feed = await response.json()
    expect(feed.items.map(x => x.content_text)).toEqual([
      'admin performed a edit-user action: change 1',
      'admin performed a edit-user action: change 2',
      'admin performed a edit-user action: change 3',
    ])
  })
})

describe('automation/build-index', () => {
  it('rejects requests without the automation key', async () => {
    const response = await automationBuild.GET(event({ url: 'http://site.test/automation/build-index/alpha?key=wrong', params: { provider: 'alpha' } }))
    expect(response.status).toBe(400)
    expect(await response.text()).toBe('needs automation key query string param')
  })

  it('streams the build log as plain text when the key matches', async () => {
    await publishVectorLibrary(server)
    publishSearchData(server)
    const response = await automationBuild.GET(event({ url: `http://site.test/automation/build-index/alpha?key=${AutomationKey}`, params: { provider: 'alpha' } }))
    expect(response.headers.get('content-type')).toBe('text/plain')
    // QUIRK: the stream enqueues strings, not bytes; SvelteKit's node adapter copes, but
    // standard Response.text() rejects it, so read the stream directly
    const reader = response.body.getReader()
    const chunks = []
    for (let r = await reader.read(); !r.done; r = await reader.read()) chunks.push(r.value)
    expect(chunks.every(x => typeof x === 'string')).toBe(true)
    const text = chunks.join('')
    expect(text.split('\n').filter(Boolean).at(-1)).toBe('Build complete')
    expect(text).toContain('Progress: 100%')
  })
})
