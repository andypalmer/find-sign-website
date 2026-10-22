// Characterisation tests for the find-sign-data client (data-io.ts, auth.ts) and the models stored through it.
import '@find-sign/test-helpers/test-env.ts'
import { DataBase, writeKeyPair } from '@find-sign/test-helpers/test-env.ts'
import { expect, describe, it, beforeEach, afterEach, vi } from 'vitest'
import { FakeDataServer } from '@find-sign/test-helpers/fake-data-server.ts'
import { readFile, writeFile, exists, listFiles, listFilenames, deletePath, bulkWrite } from '@find-sign/data-io/data-io.ts'
import { createLicense } from '@find-sign/data-io/auth.ts'
import { validateUsername, createUser, getUser, grantPower, removePower, userHasPower, listUsers, deleteUser } from '../../src/lib/models/user'
import { writeAuditLog, listAuditLogs, readAuditLog } from '../../src/lib/models/audit-log'
import { listOverrides, getOverrideFor, setOverrideFor, deleteOverrideFor } from '#lib/models/index-override.ts'
import { decodeHex, sign_open } from 'tweetnacl-ts'

let server: FakeDataServer

beforeEach(() => {
  server = new FakeDataServer().install()
})
afterEach(() => { vi.useRealTimers() })

describe('createLicense()', () => {
  it('signs "validFrom-validTo" (30s ago to 2 minutes ahead) with the identity secret key', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    const identity = process.env.SEARCH_WRITE_IDENTITY as string
    const [scheme, publicKey, signature] = createLicense(identity).split('-')
    expect(scheme).toBe('ed25519')
    expect(decodeHex(publicKey)).toEqual(writeKeyPair.publicKey)
    const message = new TextDecoder().decode(sign_open(decodeHex(signature), writeKeyPair.publicKey))
    expect(message).toBe('970000-1120000')
  })

  it('rejects identities without a 64 byte secret key', () => {
    expect(() => createLicense('00-11')).toThrow('invalid secret key length')
  })
})

describe('data-io requests', () => {
  it('prefixes paths with SEARCH_DATA, adds a license and a User-Agent', async () => {
    await readFile('some/file.json')
    const [request] = server.requests
    expect(request.path).toBe(`${DataBase}some/file.json`)
    expect(new URL(request.url).searchParams.get('license')).toMatch(/^ed25519-[0-9A-F]{64}-[0-9A-F]+$/) // uppercase hex
    expect(request.headers['user-agent']).toBe('find-sign-website')
  })

  it('writeFile PUTs bytes; readFile returns bytes, or undefined on 404', async () => {
    await writeFile('a.txt', 'hello')
    expect(server.requests[0]).toMatchObject({ method: 'PUT', headers: { 'content-type': 'application/octet-stream' } })
    expect(new TextDecoder().decode(await readFile('a.txt'))).toBe('hello')
    expect(await readFile('missing.txt')).toBeUndefined()
  })

  it('throws "<status>: <body>" for other http errors', async () => {
    server.failures.set(`${DataBase}broken`, 500)
    await expect(readFile('broken')).rejects.toThrow('500: forced failure')
  })

  it('exists() HEADs and treats any status except 404 as existing', async () => {
    server.set(`${DataBase}here`, 'x')
    server.failures.set(`${DataBase}broken`, 500)
    expect(await exists('here')).toBe(true)
    expect(await exists('missing')).toBe(false)
    expect(await exists('broken')).toBe(true)
    expect(server.requests.every(r => r.method === 'HEAD')).toBe(true)
  })

  it('lists directories as JSON (listFiles) or newline separated text (listFilenames), [] when missing', async () => {
    server.set(`${DataBase}dir/a.json`, '1')
    server.set(`${DataBase}dir/b.json`, '2')
    expect((await listFiles('dir')).map(f => f.name)).toEqual(['a.json', 'b.json'])
    expect(await listFilenames('dir')).toEqual(['a.json', 'b.json'])
    expect(server.requests.at(-1)!.headers['accept']).toBe('text/plain')
    expect(await listFiles('nothing')).toEqual([])
    expect(await listFilenames('nothing')).toEqual([])
  })

  it('bulkWrite POSTs strings as-is, bytes as base64, and anything else JSON encoded', async () => {
    await bulkWrite('folder', { 'a.txt': 'text', 'b.bin': new Uint8Array([1, 2]), 'c.json': { x: 1 } as any })
    expect(server.requests[0].body).toEqual({
      type: 'bulk',
      files: {
        'a.txt': { encoding: 'string', data: 'text' },
        'b.bin': { encoding: 'base64', data: 'AQI=' },
        'c.json': { encoding: 'string', data: '{"x":1}' },
      }
    })
  })

  it('deletePath sends DELETE', async () => {
    server.set(`${DataBase}gone`, 'x')
    await deletePath('gone')
    expect(server.requests[0].method).toBe('DELETE')
    expect(server.get(`${DataBase}gone`)).toBeUndefined()
  })
})

describe('user model', () => {
  it('accepts usernames that start with a letter, then letters, digits, _ and -', () => {
    expect(['alice', 'Bob_2', 'c-d'].map(validateUsername)).toEqual([true, true, true])
    expect(['', '2bob', 'a b', 'a.b', '../x'].map(validateUsername)).toEqual([false, false, false, false, false])
    // every line of a multi-line name used to be checked separately, letting path segments through
    expect(validateUsername('alice\n../users/x')).toBe(false)
    expect(validateUsername(undefined as any)).toBe(false)
  })

  it('stores users as users/<name>.json with empty powers and a created timestamp', async () => {
    await createUser('alice', { authenticators: {} })
    const stored = server.getJSON(`${DataBase}users/alice.json`)
    expect(stored).toMatchObject({ powers: [], authenticators: {} })
    expect(Date.parse(stored.created)).not.toBeNaN()
    await expect(createUser('alice', {})).rejects.toThrow('User is already registered')
  })

  it('grants and removes powers; "everything" implies every power', async () => {
    await createUser('alice', {})
    await grantPower('alice', 'edit-index')
    expect(await userHasPower('alice', 'edit-index')).toBe(true)
    expect(await userHasPower('alice', 'edit-users')).toBe(false)
    await grantPower('alice', 'everything')
    expect(await userHasPower('alice', 'edit-users')).toBe(true)
    await removePower('alice', 'everything')
    expect((await getUser('alice'))!.powers).toEqual(['edit-index'])
  })

  it('an unknown user has no powers, and granting one to them throws', async () => {
    expect(await userHasPower('nobody', 'edit-index')).toBe(false)
    await expect(grantPower('nobody', 'edit-index')).rejects.toThrow('User not found')
  })

  it('lists users from the users directory listing, and deletes them', async () => {
    await createUser('alice', {})
    await createUser('bob', {})
    server.set(`${DataBase}users/notes.txt`, 'x')
    expect(await listUsers()).toEqual(['alice', 'bob'])
    await deleteUser('bob')
    expect(await listUsers()).toEqual(['alice'])
  })
})

describe('audit log model', () => {
  it('writes one file per action named time.action.actor.random.json', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(5000)
    await writeAuditLog('alice', 'rebuild-index', 'Deep rebuilt', { index: 'alpha' })
    const [request] = server.requests
    expect(request.path).toMatch(new RegExp(`^${DataBase}audit-log/5000\\.rebuild-index\\.alice\\.[A-Za-z0-9_-]{21}\\.json$`))
    expect(JSON.parse(new TextDecoder().decode(server.get(request.path)))).toEqual({
      actor: 'alice', actionType: 'rebuild-index', time: 5000, message: 'Deep rebuilt', extra: { index: 'alpha' },
    })
  })

  it('lists entries oldest first from filenames, and reads them back with Date times', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(2000)
    await writeAuditLog('bob', 'add-user', 'second')
    vi.setSystemTime(1000)
    await writeAuditLog('alice', 'edit-user', 'first')
    const logs = await listAuditLogs()
    // timeMs is returned but missing from the AuditLogID type
    expect(logs.map((x: any) => [x.timeMs, x.actionType, x.actor])).toEqual([[1000, 'edit-user', 'alice'], [2000, 'add-user', 'bob']])
    const entry = await readAuditLog(logs[0])
    expect(entry).toMatchObject({ message: 'first', timeMs: 1000 })
    expect(entry!.time).toEqual(new Date(1000))
  })

  it('GAP: readAuditLog joins the filename into the path unchecked, so ../ reaches other files', async () => {
    server.set(`${DataBase}users/alice.json`, { time: 1, secret: 'user record' })
    const entry = await readAuditLog({ filename: '../users/alice.json' } as any)
    expect(entry).toMatchObject({ secret: 'user record' })
  })
})

describe('override model', () => {
  it('stores overrides as overrides/<provider>:<id>.json with filename-encoded parts', async () => {
    await setOverrideFor('alpha', 'big cat', { title: 'Big Cat' })
    expect(server.requests[0].path).toBe(`${DataBase}overrides/alpha:big~w.cat.json`)
    expect(await getOverrideFor('alpha', 'big cat')).toEqual({ title: 'Big Cat' })
    expect(await listOverrides()).toEqual([{ provider: 'alpha', id: 'big cat' }])
    await deleteOverrideFor('alpha', 'big cat')
    expect(await listOverrides()).toEqual([])
  })

  it('QUIRK: getOverrideFor throws when no override exists', async () => {
    await expect(getOverrideFor('alpha', 'none')).rejects.toThrow()
  })
})
