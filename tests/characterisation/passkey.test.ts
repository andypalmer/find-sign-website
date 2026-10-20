// End to end tests of passkey registration and login, through the real endpoint and webauthn
// library, using a software authenticator. GAP / QUIRK labels as in the other characterisation tests.
import '../helpers/test-env'
import { DataBase, passkeyKeyPair } from '../helpers/test-env'
import { expect, describe, it, beforeEach } from 'vitest'
import { encodeHex, decodeUTF8, sign } from 'tweetnacl-ts'
import { FakeDataServer } from '../helpers/fake-data-server'
import { event } from '../helpers/fake-event'
import { createSoftAuthenticator, b64url } from '../helpers/soft-authenticator'
import { passkeyPOST, getSession } from '../../src/lib/passkey/site-auth'

const origin = 'https://site.test'
const rpID = 'site.test'
let server: FakeDataServer

beforeEach(() => {
  server = new FakeDataServer().install()
})

async function post (body: object) {
  const e = event({ url: `${origin}/admin/login/passkey`, method: 'POST', body })
  const response = await passkeyPOST(e)
  return { e, json: await response.json() }
}

async function register (username: string) {
  const authenticator = await createSoftAuthenticator({ origin, rpID })
  const { json: start } = await post({ type: 'start', username, autofill: false })
  const attestation = await authenticator.register(start.options)
  const result = await post({ type: 'register', username, autofill: false, attestation })
  return { authenticator, start, ...result }
}

describe('passkey registration', () => {
  it('offers registration options for a new username', async () => {
    const { json } = await post({ type: 'start', username: 'newbie', autofill: false })
    expect(json.action).toBe('register')
    expect(json.options).toMatchObject({
      rp: { id: rpID, name: 'Find Sign' },
      user: { name: 'newbie' },
      attestation: 'none',
      authenticatorSelection: { userVerification: 'preferred' },
    })
    // the user handle is the utf-8 username, which existing passkeys were registered with
    // (simplewebauthn v5 sent the plain string and its browser library utf-8 encoded it; v10+ sends base64url)
    expect(json.options.user.id).toBe(b64url(new TextEncoder().encode('newbie')))
    expect(typeof json.options.challenge).toBe('string')
  })

  it('verifies the attestation, stores the passkey, and sets a session cookie', async () => {
    const { authenticator, json, e } = await register('newbie')
    expect(json).toMatchObject({ verified: true, session: { username: 'newbie' } })

    const stored = server.getJSON(`${DataBase}users/newbie.json`)
    expect(stored.powers).toEqual([])
    expect(stored.authenticators[authenticator.id]).toMatchObject({
      credentialID: [...authenticator.credentialID],
      credentialType: 'public-key',
      counter: 0,
    })
    expect(stored.authenticators[authenticator.id].credentialPublicKey.length).toBeGreaterThan(64)

    const [cookie] = e.cookies.writes
    expect(cookie).toMatchObject({ op: 'set', name: 'token', opts: { path: '/', maxAge: 86400 } })
    const session = getSession(event({ cookie: `token=${cookie.value}` }))
    expect(session).toMatchObject({ username: 'newbie' })
  })
})

describe('passkey login', () => {
  it('offers login options listing the account\'s passkeys', async () => {
    const { authenticator } = await register('alice')
    const { json } = await post({ type: 'start', username: 'alice', autofill: false })
    expect(json.action).toBe('login')
    expect(json.options.rpId).toBe(rpID)
    expect(json.options.allowCredentials.map(x => x.id)).toEqual([authenticator.id])
  })

  it('verifies the assertion, updates the counter, and sets a session cookie', async () => {
    const { authenticator } = await register('alice')
    const { json: start } = await post({ type: 'start', username: 'alice', autofill: false })
    const attestation = await authenticator.authenticate(start.options)
    const { json, e } = await post({ type: 'login', username: 'alice', autofill: false, attestation })
    expect(json).toMatchObject({ verified: true, session: { username: 'alice' } })
    expect(e.cookies.writes[0]).toMatchObject({ op: 'set', name: 'token' })
    const stored = server.getJSON(`${DataBase}users/alice.json`).authenticators[authenticator.id]
    expect(stored.counter).toBe(1)
    expect(Date.parse(stored.lastUsed)).not.toBeNaN()
  })

  it('rejects an assertion for a different origin', async () => {
    const { authenticator } = await register('alice')
    const { json: start } = await post({ type: 'start', username: 'alice', autofill: false })
    const attestation = await authenticator.authenticate(start.options, { origin: 'https://evil.test' })
    const { json } = await post({ type: 'login', username: 'alice', autofill: false, attestation })
    expect(json).toMatchObject({ verified: false, reason: expect.stringMatching(/origin/i) })
  })

  it('rejects an assertion over a challenge the server never signed', async () => {
    const { authenticator } = await register('alice')
    const forged = { challenge: b64url(new TextEncoder().encode('00'.repeat(80))) }
    const attestation = await authenticator.authenticate(forged)
    const { json } = await post({ type: 'login', username: 'alice', autofill: false, attestation })
    expect(json).toMatchObject({ verified: false, reason: expect.stringMatching(/challenge/i) })
  })

  it('rejects a replayed assertion (counter does not increase)', async () => {
    const { authenticator } = await register('alice')
    const { json: start } = await post({ type: 'start', username: 'alice', autofill: false })
    const attestation = await authenticator.authenticate(start.options)
    await post({ type: 'login', username: 'alice', autofill: false, attestation })
    const { json, e } = await post({ type: 'login', username: 'alice', autofill: false, attestation })
    expect(json).toMatchObject({ verified: false, reason: expect.stringMatching(/counter/i) })
    expect(e.cookies.writes).toEqual([])
  })

  it.each([
    ['older than 5 minutes', { challenge: true, ts: Date.now() - 6 * 60 * 1000 }],
    ['from the future', { challenge: true, ts: Date.now() + 10 * 60 * 1000 }],
    ['without the challenge marker (e.g. old style)', { ts: Date.now() }],
    ['a session token', { username: 'alice', ts: Math.round(Date.now() / 1000) }],
  ])('rejects a server-signed challenge token that is %s', async (_label, payload) => {
    const { authenticator } = await register('alice')
    const token = encodeHex(sign(decodeUTF8(JSON.stringify(payload)), passkeyKeyPair.secretKey))
    const attestation = await authenticator.authenticate({ challenge: b64url(new TextEncoder().encode(token)) })
    const { json } = await post({ type: 'login', username: 'alice', autofill: false, attestation })
    expect(json).toMatchObject({ verified: false, reason: expect.stringMatching(/challenge/i) })
  })

  it('answers verified: false for an unknown user or passkey', async () => {
    const authenticator = await createSoftAuthenticator({ origin, rpID })
    const attestation = await authenticator.authenticate({ challenge: 'AA' })
    expect((await post({ type: 'login', username: 'nobody', autofill: false, attestation })).json)
      .toEqual({ verified: false, reason: 'User not found' })
    await register('alice')
    expect((await post({ type: 'login', username: 'alice', autofill: false, attestation })).json)
      .toEqual({ verified: false, reason: 'Passkey not found in user account' })
  })
})

describe('passkey autofill login', () => {
  it('offers options without allowCredentials, and takes the username from the passkey user handle', async () => {
    const { authenticator } = await register('alice')
    const { json: start } = await post({ type: 'start', username: '', autofill: true })
    expect(start.action).toBe('login')
    expect(start.options.allowCredentials ?? []).toEqual([])
    const attestation = await authenticator.authenticate(start.options, { userHandle: 'alice' })
    const { json } = await post({ type: 'login', username: '', autofill: true, attestation })
    expect(json).toMatchObject({ verified: true, session: { username: 'alice' } })
  })

  it('cannot use a user handle to log in as someone whose passkey it is not', async () => {
    await register('alice')
    const { authenticator: mallory } = await register('mallory')
    const { json: start } = await post({ type: 'start', username: '', autofill: true })
    const attestation = await mallory.authenticate(start.options, { userHandle: 'alice' })
    const { json } = await post({ type: 'login', username: '', autofill: true, attestation })
    expect(json).toEqual({ verified: false, reason: 'Passkey not found in user account' })
  })
})

describe('passkey usernames', () => {
  it.each(['../audit-log/x', 'alice\n../users/x', ''])('refuses to register %j, writing nothing', async (username) => {
    const authenticator = await createSoftAuthenticator({ origin, rpID })
    const { json: start } = await post({ type: 'start', username: 'placeholder', autofill: false })
    const attestation = await authenticator.register(start.options)
    const { json } = await post({ type: 'register', username, autofill: false, attestation })
    expect(json).toEqual({ verified: false, reason: 'Unacceptable username' })
    expect(server.requests.filter(r => r.method !== 'GET' && r.method !== 'HEAD')).toEqual([])
  })

  it('never reads outside users/ for a user handle path', async () => {
    const authenticator = await createSoftAuthenticator({ origin, rpID })
    const attestation = await authenticator.authenticate({ challenge: 'AA' }, { userHandle: '../audit-log/x' })
    const { json } = await post({ type: 'login', username: '', autofill: true, attestation })
    expect(json).toEqual({ verified: false, reason: 'User not found' })
    expect(server.requests.filter(r => !r.path.includes('/users/'))).toEqual([])
  })

  it('refuses to register a username that is already taken', async () => {
    await register('alice')
    const { json } = await register('alice')
    expect(json).toEqual({ verified: false, reason: 'Username already in use' })
  })
})
