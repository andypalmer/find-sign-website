import { readFile, writeFile, deletePath, listFilenames } from '#lib/data-io/data-io.ts'
import { bytesToString } from '#lib/functions/string-encode.ts'
import type { PasskeyAuthenticator } from '#lib/passkey/endpoint.ts'

export type UserEntitlement = 'everything' | 'edit-index' | 'edit-users'
export type Username = string

export type UserAccount = {
  powers: UserEntitlement[], // user's entitlements
  created: string, // creation timestamp epochMs
  authenticators: {
    [id: string]: PasskeyAuthenticator
  }
}

export function validateUsername (username: Username): boolean {
  // no m flag: ^ and $ must match the whole string, not just one line of it
  return typeof username === 'string' && /^[a-z][a-z0-9_-]*$/iu.test(username)
}

export async function createUser (username: Username, data) {
  if (!validateUsername(username)) throw new Error('Unacceptable username')
  if (await getUser(username)) throw new Error('User is already registered')
  await setUser(username, {
    powers: [],
    created: (new Date()).toISOString(),
    ...data
  })
}

/** Given a credential ID, lookup user and return their information
 * if user doesn't exist, returns undefined
 */
export async function getUser (username: Username): Promise<UserAccount> {
  if (!validateUsername(username)) throw new Error('Unacceptable username')
  const fileData = await readFile(`users/${username}.json`)
  if (fileData === undefined) return undefined
  const obj = JSON.parse(bytesToString(fileData))
  return obj
}

export async function setUser (username: Username, data: UserAccount) {
  if (!validateUsername(username)) throw new Error('Unacceptable username')
  await writeFile(`users/${username}.json`, JSON.stringify(data))
}

export async function grantPower (username: Username, power: UserEntitlement) {
  const user = await getUser(username)
  if (!user.powers.includes(power)) {
    user.powers.push(power)
    await setUser(username, user)
  }
}

export async function removePower (username: Username, power: UserEntitlement) {
  const user = await getUser(username)
  if (user.powers.includes(power)) {
    user.powers = user.powers.filter(x => x !== power)
    await setUser(username, user)
  }
}

export async function userHasPower (username: Username, power: UserEntitlement) {
  const user = await getUser(username)
  if (!Array.isArray(user.powers)) return false
  if (user.powers.includes(power)) return true
  if (user.powers.includes('everything')) return true
  return false
}

export async function deleteUser (username: Username) {
  if (!validateUsername(username)) throw new Error('Unacceptable username')
  await deletePath(`users/${username}.json`)
}

export async function listUsers (): Promise<string[]> {
  const filenames = await listFilenames('users')
  return filenames.filter(x => x.endsWith('.json')).map(x => x.split('.')[0]).filter(validateUsername)
}
