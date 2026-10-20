// vite plugin for the apps' vite.config.js: keeps secrets out of the browser.
// secrets live in VITE_* env vars (import.meta.env), which vite inlines into any client module that reads
// them, so a stray import would publish them. this fails the build if a secret's value appears in client
// output, and refuses to start at all if an env var the app must never hold is set.
import { loadEnv } from 'vite'

/**
 * @param {{ secret?: string[], forbidden?: string[] }} names
 *   secret: env vars that must never reach client code
 *   forbidden: env vars this app must not be given at all
 * @returns {import('vite').Plugin}
 */
export default function secretGuard ({ secret = [], forbidden = [] }) {
  /** @type {[string, string][]} */
  let secrets = []
  /** @type {boolean} */
  let ssrBuild = false

  return {
    name: 'find-sign-secret-guard',

    configResolved (config) {
      const env = { ...loadEnv(config.mode, config.envDir || config.root, ''), ...process.env }
      const present = forbidden.filter(name => env[name])
      if (present.length) throw new Error(`${present.join(', ')} must not be set for this app (${config.root})`)
      // short values could match by accident, and nothing that short is a real secret
      secrets = secret.flatMap(name => env[name] && env[name].length >= 8 ? [[name, env[name]]] : [])
      ssrBuild = !!config.build.ssr
    },

    generateBundle (_options, bundle) {
      const environment = /** @type {{ config?: { consumer?: string } } | undefined} */ (/** @type {any} */ (this).environment)
      const isClient = environment?.config?.consumer ? environment.config.consumer === 'client' : !ssrBuild
      if (!isClient) return
      for (const file of Object.values(bundle)) {
        const text = file.type === 'chunk' ? file.code : typeof file.source === 'string' ? file.source : Buffer.from(file.source).toString('latin1')
        for (const [name, value] of secrets) {
          if (text.includes(value)) this.error(`${name} is in client output ${file.fileName}: only server code may read it`)
        }
      }
    }
  }
}
