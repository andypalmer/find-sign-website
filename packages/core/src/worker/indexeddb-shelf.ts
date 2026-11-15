// The real shelf: keeps files in the browser's IndexedDB, so they are still there after the worker has been
// stopped and started again (which browsers do whenever they like).
import type { IRememberFilesByName } from './file-keeper.ts'

/** the part of the browser's `indexedDB` we use; tests pass a pretend one */
export type OpensDatabases = Pick<IDBFactory, 'open'>

/** our one drawer in the database; each file is kept under its name */
const drawerName = 'files'

/** wait for a request to the database to finish, and give its answer */
function answerOf<T> (request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** wait until the database says the whole piece of work is safely written (not just asked for) */
function savedBy (transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new Error('the database dropped the work'))
  })
}

export class IndexedDbShelf implements IRememberFilesByName {
  /** the open database; kept so we open it once, and forgotten if opening fails so the next ask tries again */
  private database: Promise<IDBDatabase> | undefined

  constructor (private databases: OpensDatabases, private databaseName: string) {}

  async recall (name: string): Promise<Uint8Array | undefined> {
    const drawer = await this.drawerToRead()
    const found = await answerOf<unknown>(drawer.get(name))
    return found === undefined ? undefined : found as Uint8Array
  }

  async remember (name: string, bytes: Uint8Array): Promise<void> {
    const { drawer, saved } = await this.drawerToWrite()
    drawer.put(bytes, name)
    await saved
  }

  async names (): Promise<string[]> {
    const drawer = await this.drawerToRead()
    return (await answerOf(drawer.getAllKeys())).map(String)
  }

  async sizes (): Promise<Record<string, number>> {
    const drawer = await this.drawerToRead()
    return new Promise((resolve, reject) => {
      const sizes: Record<string, number> = {}
      const walk = drawer.openCursor()
      walk.onsuccess = () => {
        const cursor = walk.result
        if (!cursor) return resolve(sizes)
        sizes[String(cursor.key)] = (cursor.value as Uint8Array).byteLength
        cursor.continue()
      }
      walk.onerror = () => reject(walk.error)
    })
  }

  async forget (name: string): Promise<void> {
    const { drawer, saved } = await this.drawerToWrite()
    drawer.delete(name)
    await saved
  }

  /** a drawer to read from; a read has nothing to wait for but its answer */
  private async drawerToRead (): Promise<IDBObjectStore> {
    return (await this.open()).transaction(drawerName, 'readonly').objectStore(drawerName)
  }

  /** a drawer to write to, and a receipt that arrives once the database has safely saved what we put in it */
  private async drawerToWrite (): Promise<{ drawer: IDBObjectStore, saved: Promise<void> }> {
    const transaction = (await this.open()).transaction(drawerName, 'readwrite')
    return { drawer: transaction.objectStore(drawerName), saved: savedBy(transaction) }
  }

  private open (): Promise<IDBDatabase> {
    if (!this.database) {
      this.database = new Promise<IDBDatabase>((resolve, reject) => {
        const request = this.databases.open(this.databaseName)
        // a newer build may change the database's shape; if the drawer is already there, leave it be
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(drawerName)) request.result.createObjectStore(drawerName)
        }
        request.onsuccess = () => {
          const database = request.result
          // another connection wants to upgrade the database: let go at once, or it waits on us. The next call reopens it.
          database.onversionchange = () => {
            database.close()
            this.database = undefined
          }
          resolve(database)
        }
        request.onerror = () => reject(request.error)
      })
      this.database.catch(() => { this.database = undefined })
    }
    return this.database
  }
}
