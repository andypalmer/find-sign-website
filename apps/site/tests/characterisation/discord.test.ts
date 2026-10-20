// Tests for discord interaction request signature checking.
import '@find-sign/test-helpers/test-env.ts'
import { discordKeyPair } from '@find-sign/test-helpers/test-env.ts'
import { expect, describe, it } from 'vitest'
import { isHttpError } from '@sveltejs/kit'
import { encodeHex, decodeUTF8, sign_detached } from 'tweetnacl-ts'
import { POST } from '../../src/routes/discord/interactions/+server'

function interaction (body: object, { secretKey = discordKeyPair.secretKey, headers = undefined }: { secretKey?: Uint8Array, headers?: HeadersInit } = {}) {
  const bodyText = JSON.stringify(body)
  const timestamp = '1792500000'
  const signature = encodeHex(sign_detached(decodeUTF8(timestamp + bodyText), secretKey))
  return new Request('http://site.test/discord/interactions', {
    method: 'POST',
    body: bodyText,
    headers: headers || { 'X-Signature-Ed25519': signature, 'X-Signature-Timestamp': timestamp },
  })
}

async function post (request: Request): Promise<any> {
  try {
    return await POST({ request })
  } catch (err) {
    return err
  }
}

describe('discord/interactions POST', () => {
  it('answers a correctly signed PING with PONG', async () => {
    const response = await post(interaction({ type: 1 }))
    expect(await response.json()).toEqual({ type: 1 })
  })

  it('rejects a request signed with the wrong key with 401', async () => {
    const thrown = await post(interaction({ type: 1 }, { secretKey: new Uint8Array(64).fill(1) }))
    expect(isHttpError(thrown, 401)).toBe(true)
  })

  it('rejects a tampered body with 401', async () => {
    const request = interaction({ type: 1 })
    const tampered = new Request(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify({ type: 2 }) })
    expect(isHttpError(await post(tampered), 401)).toBe(true)
  })

  it('rejects requests without signature headers with 401', async () => {
    const thrown = await post(interaction({ type: 1 }, { headers: {} }))
    expect(isHttpError(thrown, 401)).toBe(true)
  })
})
