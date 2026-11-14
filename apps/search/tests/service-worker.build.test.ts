// Checks what the BUILD makes of the service worker, because nothing else does: the unit tests run the worker's
// source, and a bug in how the built file is loaded only shows in a browser. (This builds the whole app, about 20 seconds.)
import '@find-sign/test-helpers/test-env.ts'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { workerType } from '../src/lib/worker-search.ts'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
let builtWorker = ''
let copies = ''

/** whether node accepts the file as a script of this kind, and what it says if not */
function check (file: string, kind: 'classic' | 'module'): { ok: boolean, complaint: string } {
  const copy = path.join(copies, kind === 'module' ? 'worker.mjs' : 'worker.cjs')
  copyFileSync(file, copy)
  try {
    execFileSync(process.execPath, ['--check', copy], { stdio: 'pipe' })
    return { ok: true, complaint: '' }
  } catch (error) {
    return { ok: false, complaint: String((error as { stderr?: Buffer }).stderr ?? error) }
  }
}

beforeAll(() => {
  // a build of its own, with the settings a real build has: not the test settings, which include ones this app refuses to start with
  const { SEARCH_WRITE_IDENTITY, PASSKEY_CHALLENGE_SECRET, VITEST, NODE_ENV, ...settings } = process.env
  try {
    execFileSync('npx', ['vite', 'build'], { cwd: appRoot, stdio: 'pipe', timeout: 170_000, env: { ...settings, NODE_ENV: 'production' } })
  } catch (error) {
    throw new Error(`the app didn't build:\n${String((error as { stderr?: Buffer }).stderr ?? error).slice(-1500)}`)
  }
  builtWorker = path.join(appRoot, '.svelte-kit/output/client/service-worker.js')
  copies = mkdtempSync(path.join(tmpdir(), 'find-sign-worker-'))
}, 180_000)

describe('the built service worker', () => {
  it('is registered by the page as a module whenever it has to be one, which is when it has an import', () => {
    const asAClassicScript = check(builtWorker, 'classic')
    const needsAModule = !asAClassicScript.ok && /import statement|export/.test(asAClassicScript.complaint)
    // a worker with an import fails to start as a classic script: "Cannot use import statement outside a module"
    expect(needsAModule ? workerType : 'module').toBe('module')
  })

  it('is a script the browser can load as a module', () => {
    expect(check(builtWorker, 'module')).toEqual({ ok: true, complaint: '' })
  })

  it('imports only the site\'s own settings module, which the site serves, and nothing from a file that might not be there', () => {
    const code = readFileSync(builtWorker, 'utf8')
    const imported = [...code.matchAll(/(?:\bfrom|\bimport)\s*["']([^"']+)["']/g)].map(match => match[1])
    expect([...new Set(imported)].sort()).toEqual(['/_app/env.js'])
  })
})
