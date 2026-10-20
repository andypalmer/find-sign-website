import { type RequestEvent, type RequestHandler } from "@sveltejs/kit"
import {
  generateRegistrationOptions, generateAuthenticationOptions,
  verifyRegistrationResponse, verifyAuthenticationResponse, type GenerateAuthenticationOptionsOpts
} from "@simplewebauthn/server"
import { isoBase64URL, isoUint8Array } from "@simplewebauthn/server/helpers"
import { encodeHex, decodeHex, encodeUTF8, decodeUTF8, sign_open, sign_keyPair_fromSecretKey, sign_keyPair, sign } from "tweetnacl-ts"

type MaybePromise<T> = Promise<T> | T

// how long a login/registration challenge stays valid, and how far in the future one may claim to be
const ChallengeMaxAge = 5 * 60 * 1000
const ChallengeClockSkew = 60 * 1000

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
    // sveltekit adds this to the response (httpOnly, sameSite lax, and secure except on http://localhost)
    event.cookies.set('token', generateToken(session), { path: '/', maxAge: cookieMaxAge })
    return new Response(JSON.stringify({ verified, session }))
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

      const challenge = generateToken({ challenge: true, ts: Date.now() })

      if (!userObj && username) {
        // account doesn't exist, register flow
        const options = await generateRegistrationOptions({
          rpID,
          rpName,
          // user handle is the utf-8 username, as passkeys registered before simplewebauthn v10 have
          userID: isoUint8Array.fromUTF8String(username),
          userName: username,
          userDisplayName: username,
          challenge
        })
        return Response.json({ action: 'register', options, challenge })
      } else {
        // account exists, login flow
        const genOpts: GenerateAuthenticationOptionsOpts = { rpID, challenge }
        if (userObj) {
          genOpts.allowCredentials = Object.values(userObj.authenticators).map(authenticator => {
            return { id: isoBase64URL.fromBuffer(Uint8Array.from(authenticator.credentialID)) }
          })
        }
        const options = await generateAuthenticationOptions(genOpts)
        return Response.json({ action: 'login', options, challenge })
      }
    } else if (req.type === 'login') {
      const { attestation } = req
      // with autofill the user picks a passkey without typing a username, so it comes from the
      // passkey's user handle. Either way, the signature must verify against that user's stored passkey
      const username = req.username || (attestation?.response?.userHandle && isoBase64URL.toUTF8String(attestation.response.userHandle))
      try {
        const userObj = username ? await endpointOptions.getUser(username) : undefined
        if (!userObj) throw new Error('User not found')
        const stored = userObj.authenticators[attestation.id]
        if (!stored) throw new Error('Passkey not found in user account')

        const verification = await verifyAuthenticationResponse({
          credential: {
            id: isoBase64URL.fromBuffer(Uint8Array.from(stored.credentialID)),
            publicKey: Uint8Array.from(stored.credentialPublicKey),
            counter: stored.counter
          },
          response: attestation,
          expectedChallenge: isServerChallenge,
          expectedOrigin: origin,
          expectedRPID: rpID,
          // matches simplewebauthn v5's default; options ask for userVerification 'preferred'
          requireUserVerification: false,
        })
        if (!verification.verified) throw new Error('Passkey verification failed')

        // update authenticator data in database
        stored.counter = verification.authenticationInfo.newCounter
        stored.credentialDeviceType = verification.authenticationInfo.credentialDeviceType
        stored.credentialBackedUp = verification.authenticationInfo.credentialBackedUp
        stored.lastUsed = (new Date()).toISOString()
        await endpointOptions.updateUser(username, userObj, event)

        return loginSuccessResponse(username, event)
      } catch (err) {
        return failedResponse('Login', username, err, event)
      }

    } else if (req.type === 'register') {
      const { username, attestation } = req
      try {
        const verification = await verifyRegistrationResponse({
          response: attestation,
          expectedChallenge: isServerChallenge,
          expectedOrigin: origin,
          expectedRPID: rpID,
          // matches simplewebauthn v5's default; options ask for userVerification 'preferred'
          requireUserVerification: false,
        })
        if (!verification.verified) throw new Error('Passkey verification failed')

        const { credential } = verification.registrationInfo
        await endpointOptions.createUser(username, {
          authenticators: {
            [attestation.id]: {
              credentialID: [...isoBase64URL.toBuffer(credential.id)],
              credentialPublicKey: [...credential.publicKey],
              credentialType: verification.registrationInfo.credentialType,
              credentialDeviceType: verification.registrationInfo.credentialDeviceType,
              credentialBackedUp: verification.registrationInfo.credentialBackedUp,
              counter: credential.counter,
              lastUsed: (new Date()).toISOString()
            }
          }
        }, event)
        return loginSuccessResponse(username, event)
      } catch (err) {
        return failedResponse('Registration', username, err, event)
      }
    }

    return new Response('unknown request type', { headers: { 'Content-Type': 'text/plain' } })
  }

  /** was this webauthn challenge (base64url of the utf-8 token) issued by this server, recently? */
  function isServerChallenge (challenge: string): boolean {
    try {
      const data = verifyToken(isoBase64URL.toUTF8String(challenge))
      if (!data || data.challenge !== true || typeof data.ts !== 'number') return false
      const age = Date.now() - data.ts
      return age >= -ChallengeClockSkew && age <= ChallengeMaxAge
    } catch (err) {
      return false
    }
  }

  function failedResponse (action: string, username: string, err: unknown, event: RequestEvent): Response {
    const reason = err instanceof Error ? err.message : String(err)
    console.info(`${action} failed for "${username}" from ${event.getClientAddress()}: ${reason}`)
    return Response.json({ verified: false, reason })
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
    const token = event.cookies.get('token')

    // verify and parse login cookie tokens if user is passkey logged in
    if (token) {
      const sessionData = verifyToken(token)
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
