// Starts the service worker: reads its settings from its own address, builds everything it needs (the file
// keeper, the librarian, the desks and the switchboard), and listens for the browser's events. The service
// worker's own file is only a few lines that hand its global to startTheWorker, so everything here can be
// tested under node with a pretend global.
import { vectorLibrary } from '@andypalmer/vectors'
import { FrontDesk, SearchDesk } from './desks.ts'
import { fileKeeperForTheBrowser } from './browser-file-keeper.ts'
import type { FetchAFile } from './file-keeper.ts'
import type { OpensDatabases } from './indexeddb-shelf.ts'
import { KeptLibrary } from './kept-library.ts'
import type { IAnswerLetters, IReceiveLetters, ReplyPort } from './letters.ts'
import { Switchboard } from './switchboard.ts'
import { sayingWhichLibrary } from '#lib/search/vector-lookup-errors.ts'
import { checkedFetch } from '#lib/functions/checked-fetch.ts'
import { indexFolderOf, settingsFromTheWorkersAddress } from './worker-settings.ts'

/** the parts of the service worker's global that the worker uses; tests pass a pretend one */
export type WorkerScope = {
  location: { href: string },
  fetch: FetchAFile,
  indexedDB: OpensDatabases,
  skipWaiting (): Promise<void>,
  clients: { claim (): Promise<void> },
  addEventListener (type: 'install' | 'activate' | 'message', listener: (event: any) => void): void,
}

/** the parts of the browser's events that the worker uses */
type ExtendableEvent = { waitUntil (promise: Promise<unknown>): void }
type MessageEventWithPorts = ExtendableEvent & { data: unknown, ports?: ArrayLike<ReplyPort> }

/** `workerBuild` says which build of the worker this is, so a page and a log can tell */
export function startTheWorker (scope: WorkerScope, workerBuild: string): void {
  const switchboard = switchboardFor(scope, workerBuild)

  // a new worker takes over from an older one at once, and takes charge of pages that are already open: the
  // pages and workers agree what to say to each other in hello, so one of each version can meet
  scope.addEventListener('install', (event: ExtendableEvent) => event.waitUntil(scope.skipWaiting()))
  scope.addEventListener('activate', (event: ExtendableEvent) => event.waitUntil(scope.clients.claim()))

  // each letter comes with the end of a channel to answer on. A worker may be stopped as soon as nothing asks it
  // to stay awake, so we ask to stay awake until the page has its ending
  scope.addEventListener('message', (event: MessageEventWithPorts) => {
    const replyPort = event.ports?.[0]
    if (!replyPort) return // nobody to answer
    event.waitUntil(switchboard.receive(event.data, replyPort))
  })
}

function switchboardFor (scope: WorkerScope, workerBuild: string): IReceiveLetters {
  const settings = settingsFromTheWorkersAddress(scope.location.href)
  if (!settings) {
    // without its settings the worker can do nothing, and the right answer to every question is "no such desk":
    // that sends the page to its fallback, which is today's search
    console.error(`The service worker was started without its settings (${scope.location.href}), so it will turn every question down`)
    return new Switchboard({})
  }

  // the browser refuses to run fetch when it is called as a method of some other object, so we wrap it
  const { fetch } = scope
  const fetchOnItsOwn: FetchAFile = (url, init) => fetch(url, init)
  const folder = indexFolderOf(settings)
  const keeper = fileKeeperForTheBrowser({
    baseUrl: folder,
    fetch: fetchOnItsOwn,
    indexedDB: scope.indexedDB,
    // one database for each index folder, so another folder's manifest.json is never mistaken for this one's
    databaseName: `find-sign-index:${folder}`
  })
  const library = new KeptLibrary(keeper, { baseUrl: folder, indexes: settings.indexes })
  const wordVectors = vectorLibrary(settings.vectorLibraryUrl.replace(/\/+$/, ''), { fetch: checkedFetch(fetchOnItsOwn as typeof globalThis.fetch) })
  const desks: Record<string, IAnswerLetters> = {
    'front-desk': new FrontDesk(workerBuild),
    'search-desk': new SearchDesk(library.asSearchSeams(sayingWhichLibrary(settings.vectorLibraryUrl, wordVectors.lookup)))
  }
  return new Switchboard(desks)
}
