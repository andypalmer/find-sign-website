// Gets the service worker registered, and ready to be sent letters, from the page. The browser's own objects are
// described by the small interfaces below (they match the real ones), so all of this runs under node in tests.
import type { IPostLetters } from './messenger.ts'

/** the parts of the browser's ServiceWorker that the page uses; tests pass a pretend one */
export interface IWorkerLike {
  scriptURL: string
  state: string
  postMessage (message: unknown, transfer: Transferable[]): void
  addEventListener (type: 'statechange', listener: () => void): void
  removeEventListener (type: 'statechange', listener: () => void): void
}

export interface IRegistrationLike {
  installing: IWorkerLike | null
  waiting: IWorkerLike | null
  active: IWorkerLike | null
  addEventListener (type: 'updatefound', listener: () => void): void
  removeEventListener (type: 'updatefound', listener: () => void): void
  unregister (): Promise<boolean>
}

export interface IServiceWorkerContainerLike {
  register (scriptAddress: string, options?: { type?: 'classic' | 'module' }): Promise<IRegistrationLike>
  getRegistrations (): Promise<readonly IRegistrationLike[]>
}

export type RegisterOptions = {
  /** 'module' for the dev server, which serves the worker as a module; the built site's is a classic script */
  type?: 'classic' | 'module',
  /** how long to wait for the worker to be ready; a first visit has it to install */
  timeoutMs?: number,
  /** the page's own address, which a relative script address is relative to */
  pageAddress?: string,
}

/**
 * Registers the worker at this address, and gives it back once it is active. The settings are on the end of the
 * address, so a change of settings is a different address and the browser installs a different worker: an older
 * worker that is still active at another address is not the one we want, so we wait for the one at ours.
 */
export async function registerTheWorker (container: IServiceWorkerContainerLike, scriptAddress: string, options: RegisterOptions = {}): Promise<IWorkerLike> {
  const wanted = new URL(scriptAddress, options.pageAddress ?? globalThis.location?.href).href
  const timeoutMs = options.timeoutMs ?? 4000
  const registration = await container.register(scriptAddress, options.type ? { type: options.type } : undefined)

  return await new Promise<IWorkerLike>((resolve, reject) => {
    const watching = new Set<IWorkerLike>()
    const timer = setTimeout(() => stop(() => reject(new Error(`the service worker wasn't ready after ${timeoutMs} ms`))), timeoutMs)

    const stop = (settle: () => void) => {
      clearTimeout(timer)
      registration.removeEventListener('updatefound', look)
      for (const worker of watching) worker.removeEventListener('statechange', look)
      settle()
    }
    const look = () => {
      const candidates = [registration.active, registration.waiting, registration.installing]
      const ours = candidates.find(worker => worker?.scriptURL === wanted)
      if (ours?.state === 'activated') return stop(() => resolve(ours))
      if (ours?.state === 'redundant') return stop(() => reject(new Error('the service worker was replaced before it was ready')))
      // keep an eye on every worker the registration has, so we hear when ours changes state
      for (const worker of candidates) {
        if (worker && !watching.has(worker)) {
          watching.add(worker)
          worker.addEventListener('statechange', look)
        }
      }
    }
    registration.addEventListener('updatefound', look)
    look()
  })
}

/** unregisters every worker of ours, for when the service worker has been switched off after being on. Says how many */
export async function unregisterTheWorker (container: IServiceWorkerContainerLike, scriptName = 'service-worker.js'): Promise<number> {
  const ours = (await container.getRegistrations()).filter(registration =>
    [registration.active, registration.waiting, registration.installing].some(worker => worker && new URL(worker.scriptURL).pathname.endsWith(`/${scriptName}`)))
  await Promise.all(ours.map(registration => registration.unregister()))
  return ours.length
}

/** the worker as somewhere to post letters: the end of the reply channel has to be handed over with the letter */
export function workerAsAPostbox (worker: IWorkerLike): IPostLetters {
  return { post: (letter, replyPort) => worker.postMessage(letter, [replyPort]) }
}
