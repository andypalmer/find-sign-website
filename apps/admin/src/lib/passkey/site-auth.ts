// find sign's passkey login configuration, shared by the login endpoint, the session hook, and admin routes
import { readFile, writeFile } from "@find-sign/data-io/data-io.ts"
import { bytesToString } from "@find-sign/core/functions/string-encode.ts"
import createAuthEndpoint from "#lib/passkey/endpoint.ts"
import { validateUsername } from "#lib/models/user.ts"
import { redirect } from "@sveltejs/kit"

const RelyingPartyName = 'Find Sign'

const authEndpoint = createAuthEndpoint({
  rpName: import.meta.env.VITE_VERSION_LABEL ? `${RelyingPartyName} (${import.meta.env.VITE_VERSION_LABEL})` : RelyingPartyName,
  secretKey: import.meta.env.VITE_PASSKEY_CHALLENGE_SECRET,
  // passkeys made when admin was at find.auslan.fyi/admin belong to that hostname
  rpID: import.meta.env.VITE_PASSKEY_RP_ID || undefined,

  // usernames become data server paths, and can come from the client or a passkey's user handle
  async getUser(username) {
    if (!validateUsername(username)) return undefined
    const fileData = await readFile(`users/${username}.json`)
    if (fileData) {
      const object = JSON.parse(bytesToString(fileData))
      return object
    }
  },

  async createUser(username, data) {
    if (!validateUsername(username)) throw new Error('Unacceptable username')
    if ((await readFile(`users/${username}.json`)) !== undefined) {
      throw new Error('Username already in use')
    }
    await writeFile(`users/${username}.json`, JSON.stringify({
      powers: [],
      created: (new Date()).toISOString(),
      ...data
    }))
  },

  async updateUser(username, data) {
    if (!validateUsername(username)) throw new Error('Unacceptable username')
    await writeFile(`users/${username}.json`, JSON.stringify(data))
  }
})

export const passkeyPOST = authEndpoint.POST
export const getSession = authEndpoint.getSession

/** throws a redirect to the login page */
export function loginRedirect (): never {
  redirect(307, '/login')
}
