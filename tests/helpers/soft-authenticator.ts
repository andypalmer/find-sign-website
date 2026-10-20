// A minimal software WebAuthn authenticator, for testing the passkey endpoint end to end without a
// browser. It makes a real P-256 key pair and produces registration ("none" attestation) and
// authentication responses in the JSON shape @simplewebauthn/browser hands to the server, so the
// server library verifies genuine signatures.

const subtle = globalThis.crypto.subtle

export const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url')
export const fromB64url = (text: string) => new Uint8Array(Buffer.from(text, 'base64url'))
const utf8 = (text: string) => new TextEncoder().encode(text)
const sha256 = async (bytes: Uint8Array) => new Uint8Array(await subtle.digest('SHA-256', bytes as BufferSource))
const concat = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap(part => [...part]))
const uint32 = (n: number) => Uint8Array.of(n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255)

// just enough CBOR for COSE keys and attestation objects: ints, byte strings, text strings, maps
function cbor (value: any): Uint8Array {
  const head = (major: number, n: number) => {
    if (n < 24) return Uint8Array.of((major << 5) | n)
    if (n < 256) return Uint8Array.of((major << 5) | 24, n)
    if (n < 65536) return Uint8Array.of((major << 5) | 25, n >> 8, n & 255)
    return concat(Uint8Array.of((major << 5) | 26), uint32(n))
  }
  if (typeof value === 'number') return value >= 0 ? head(0, value) : head(1, -1 - value)
  if (value instanceof Uint8Array) return concat(head(2, value.length), value)
  if (typeof value === 'string') return concat(head(3, utf8(value).length), utf8(value))
  if (value instanceof Map) return concat(head(5, value.size), ...[...value].flatMap(([k, v]) => [cbor(k), cbor(v)]))
  throw new Error(`cbor: unsupported value ${value}`)
}

// webauthn wants ECDSA signatures DER encoded, webcrypto produces raw r || s
function derSignature (raw: Uint8Array): Uint8Array {
  const integer = (bytes: Uint8Array) => {
    let i = 0
    while (i < bytes.length - 1 && bytes[i] === 0) i++
    let trimmed = bytes.slice(i)
    if (trimmed[0] & 0x80) trimmed = concat(Uint8Array.of(0), trimmed)
    return concat(Uint8Array.of(0x02, trimmed.length), trimmed)
  }
  const body = concat(integer(raw.slice(0, 32)), integer(raw.slice(32)))
  return concat(Uint8Array.of(0x30, body.length), body)
}

export async function createSoftAuthenticator ({ origin, rpID }: { origin: string, rpID: string }) {
  const keyPair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const credentialID = globalThis.crypto.getRandomValues(new Uint8Array(16))
  let counter = 0

  const rpIdHash = await sha256(utf8(rpID))
  const flags = 0x01 | 0x04 // user present, user verified

  async function clientData (type: string, challenge: string) {
    return utf8(JSON.stringify({ type, challenge, origin, crossOrigin: false }))
  }

  return {
    credentialID,
    id: b64url(credentialID),

    /** respond to registration options, as navigator.credentials.create() would */
    async register (options: { challenge: string }) {
      const jwk = await subtle.exportKey('jwk', keyPair.publicKey)
      const coseKey = cbor(new Map<number, any>([[1, 2], [3, -7], [-1, 1], [-2, fromB64url(jwk.x)], [-3, fromB64url(jwk.y)]]))
      const attestedCredentialData = concat(new Uint8Array(16), Uint8Array.of(0, credentialID.length), credentialID, coseKey)
      const authData = concat(rpIdHash, Uint8Array.of(flags | 0x40), uint32(counter), attestedCredentialData)
      const attestationObject = cbor(new Map<string, any>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]))
      return {
        id: b64url(credentialID),
        rawId: b64url(credentialID),
        type: 'public-key',
        response: {
          clientDataJSON: b64url(await clientData('webauthn.create', options.challenge)),
          attestationObject: b64url(attestationObject),
          transports: ['internal'],
        },
        clientExtensionResults: {},
      }
    },

    /** respond to authentication options, as navigator.credentials.get() would */
    async authenticate (options: { challenge: string }, { userHandle = undefined, origin: overrideOrigin = undefined } = {}) {
      counter += 1
      const authData = concat(rpIdHash, Uint8Array.of(flags), uint32(counter))
      const clientDataJSON = overrideOrigin
        ? utf8(JSON.stringify({ type: 'webauthn.get', challenge: options.challenge, origin: overrideOrigin, crossOrigin: false }))
        : await clientData('webauthn.get', options.challenge)
      const signed = concat(authData, await sha256(clientDataJSON))
      const raw = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keyPair.privateKey, signed as BufferSource))
      return {
        id: b64url(credentialID),
        rawId: b64url(credentialID),
        type: 'public-key',
        response: {
          clientDataJSON: b64url(clientDataJSON),
          authenticatorData: b64url(authData),
          signature: b64url(derSignature(raw)),
          ...(userHandle ? { userHandle: b64url(utf8(userHandle)) } : {}),
        },
        clientExtensionResults: {},
      }
    },
  }
}
