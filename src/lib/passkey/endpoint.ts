import type { RequestEvent, RequestHandler } from "@sveltejs/kit"
import {
  generateRegistrationOptions, generateAuthenticationOptions,
  verifyRegistrationResponse, verifyAuthenticationResponse, type GenerateAuthenticationOptionsOpts
} from "@simplewebauthn/server"
import { parse as cookieParse, serialize as cookieSerialize } from 'cookie'
import { encodeHex, decodeHex, encodeUTF8, decodeUTF8, sign_open, sign_keyPair_fromSecretKey, sign_keyPair, sign, decodeBase64 } from "tweetnacl-ts"

type MaybePromise<T> = Promise<T> | T

export type AuthEndpointOptions = {
  rpName: string, // name of relying party (i.e. site's name)
  rpID?: string, // hostname of the relying party (i.e. "foo.tld")
  origin?: string, // origin of the relying party (i.e. "https://foo.tld")
  secretKey?: string, // if running multiple instances, this must be set to a hex encoded ed25519 secret key
  loginMaxAge?: number, // max age of login session in seconds

  getUser: (username: string) => MaybePromise<PasskeyUserData>, // get a stored user account by username, must store json serializable data
  createUser: (username: string, data: PasskeyUserData, event: RequestEvent) => MaybePromise<void>, // create a new user by username, containing JSON serialisable data
  updateUser: (username: string, data: PasskeyUserData, event: RequestEvent) => MaybePromise<void>, // update an existing user's data by username

  newSession?: (username: string, event: RequestEvent) => any, // create a new session token value, return value is signed and set as a token cookie
  verifySession?: (token: any) => boolean, // verify a session cookie token value, can be used to check for timeouts to force logouts
}

export type PasskeyUserData = {
  authenticators: {
    [id: string]: PasskeyAuthenticator
  }
}

export type PasskeyAuthenticator = {
  credentialID: number[],
  credentialPublicKey: number[],
  credentialType: 'public-key',
  credentialDeviceType: string,
  credentialBackedUp: boolean,
  counter: number,
  lastUsed: string, // ISO date this authenticator was last seen by server during login flow
}

export default function createAuthEndpoint (endpointOptions: AuthEndpointOptions) {
  const rpName = endpointOptions.rpName
  if (!rpName) throw new Error('rpName must be specified')
  let keypair: { publicKey: Uint8Array, secretKey: Uint8Array }
  if (endpointOptions.secretKey) {
    keypair = sign_keyPair_fromSecretKey(decodeHex(endpointOptions.secretKey))
  } else {
    keypair = sign_keyPair()
  }

  // how long in seconds should the login cookie remain valid for
  const cookieMaxAge = endpointOptions.loginMaxAge || 60 * 60 * 24

  function loginSuccessResponse (username: string, event: RequestEvent): Response {
    const verified = true
    const session = endpointOptions.newSession
      ? endpointOptions.newSession(username, event)
      : { username, ts: Math.round(Date.now() / 1000) }
    return new Response(JSON.stringify({ verified, session }), {
      headers: {
        'Set-Cookie': cookieSerialize('token', generateToken(session), {
          path: '/',
          maxAge: cookieMaxAge,
          httpOnly: true
        })
      }
    })
  }

  const POST: RequestHandler = async function POST (event) {
    const { url, request } = event
    const rpID = endpointOptions.rpID || url.hostname
    const origin = endpointOptions.origin || url.origin
    const req = await request.json()

    if (req.type === 'start') {
      const { autofill, username } = req
      // get user object if user already exists and is specified
      const userObj = !autofill && username ? await endpointOptions.getUser(username) : undefined

      const challenge = generateToken({ ts: Date.now() })

      if (!userObj && username) {
        // account doesn't exist, register flow
        const options = generateRegistrationOptions({
          rpID,
          rpName,
          userID: username,
          userName: username,
          userDisplayName: username,
          challenge
        })
        return new Response(JSON.stringify({ action: 'register', options, challenge }), { headers: { 'Content-Type': 'application/json' } })
      } else {
        // account exists, login flow
        const genOpts: GenerateAuthenticationOptionsOpts = { rpID, challenge }
        if (userObj) {
          genOpts.allowCredentials = Object.values(userObj.authenticators).map(authenticator => {
            return { type: 'public-key', id: Buffer.from(authenticator.credentialID) }
          })
        }
        const options = generateAuthenticationOptions(genOpts)
        return new Response(JSON.stringify({ action: 'login', options, challenge }), { headers: { 'Content-Type': 'application/json' } })
      }
    } else if (req.type === 'login') {
      const { username, autofill, attestation } = req
      const userObj = await endpointOptions.getUser(username)
      if (!userObj) throw new Error('User not found')
      if (!userObj.authenticators[attestation.id]) throw new Error('Passkey not found in user account')

      const authenticator = {
        credentialID: Buffer.from(userObj.authenticators[attestation.id].credentialID),
        credentialPublicKey: Buffer.from(userObj.authenticators[attestation.id].credentialPublicKey),
        counter: userObj.authenticators[attestation.id].counter
      }
      const verification = verifyAuthenticationResponse({
        authenticator,
        credential: attestation,
        expectedChallenge (challenge: string) {
          const challengeData = verifyToken(encodeUTF8(decodeBase64(challenge)))
          if (!challengeData) return false
          return true
        },
        expectedOrigin: origin,
        expectedRPID: rpID,
      })

      if (verification.verified) {
        const authenticator = userObj.authenticators[attestation.id]

        // update authenticator data in database
        authenticator.counter = verification.authenticationInfo.newCounter
        authenticator.credentialDeviceType = verification.authenticationInfo.credentialDeviceType
        authenticator.credentialBackedUp = verification.authenticationInfo.credentialBackedUp
        authenticator.lastUsed = (new Date()).toISOString()

        await endpointOptions.updateUser(username, userObj, event)

        return loginSuccessResponse(username, event)
      } else {
        return new Response(JSON.stringify({ verified: false }), { headers: { 'Content-Type': 'application/json' } })
      }

    } else if (req.type === 'register') {
      const { username, autofill, attestation } = req

      const verification = await verifyRegistrationResponse({
        credential: attestation,
        expectedChallenge (challenge: string) {
          const challengeData = verifyToken(encodeUTF8(decodeBase64(challenge)))
          if (!challengeData) return false
          return true
        },
        expectedOrigin: origin,
        expectedRPID: rpID,
      })

      if (verification.verified) {
        await endpointOptions.createUser(username, {
          authenticators: {
            [attestation.id]: {
              credentialID: [...verification.registrationInfo.credentialID],
              credentialPublicKey: [...verification.registrationInfo.credentialPublicKey],
              credentialType: verification.registrationInfo.credentialType,
              credentialDeviceType: verification.registrationInfo.credentialDeviceType,
              credentialBackedUp: verification.registrationInfo.credentialBackedUp,
              counter: verification.registrationInfo.counter,
              lastUsed: (new Date()).toISOString()
            }
          }
        }, event)
        return loginSuccessResponse(username, event)
      }

    }

    return new Response('unknown request type', { headers: { 'Content-Type': 'text/plain' } })
  }

  function generateToken (tokenData: any): string {
    const message = decodeUTF8(JSON.stringify(tokenData))
    const token = encodeHex(sign(message, keypair.secretKey))
    return token
  }

  function verifyToken (token: string) {
    const buffer = decodeHex(token)
    const opened = sign_open(buffer, keypair.publicKey)
    if (opened) {
      const tokenData = JSON.parse(encodeUTF8(opened))
      if (tokenData && typeof tokenData === 'object') {
        return tokenData
      }
    }
  }

  function getSession (event: RequestEvent) {
    const cookies = cookieParse(event.request.headers.get('cookie') || '')

    // verify and parse login cookie tokens if user is passkey logged in
    if (cookies.token) {
      const sessionData = verifyToken(cookies.token)
      if (sessionData) {
        if (endpointOptions.verifySession) {
          if (!endpointOptions.verifySession(sessionData)) return {}
        } else {
          if (typeof sessionData !== 'object' || !('username' in sessionData) || !('ts' in sessionData)) {
            return {}
          }
          if (sessionData.ts < (Date.now() / 1000) - cookieMaxAge) {
            return {}
          }
        }
        return sessionData
      } else {
        console.info('Invalid Token Cookie recieved from ' + event.getClientAddress(), event.request.headers.get('cookie'), 'accessing', event.url.toString())
      }
    }

    return {}
  }

  return {
    POST,
    getSession,
    generateToken,
    verifyToken,
  }
}
