// The memory shelf: keeps files in the program's own memory, so they last as long as the program runs and no longer.
// The server uses it to keep index files between requests; it has the same shape as the browser's shelf.
import type { IRememberFilesByName } from './file-keeper.ts'

export class MemoryShelf implements IRememberFilesByName {
  private files = new Map<string, Uint8Array>()

  async recall (name: string): Promise<Uint8Array | undefined> {
    return this.files.get(name)
  }

  // a copy, so the caller can reuse its own buffer without changing what is kept
  async remember (name: string, bytes: Uint8Array): Promise<void> {
    this.files.set(name, new Uint8Array(bytes))
  }

  async names (): Promise<string[]> {
    return [...this.files.keys()]
  }

  async sizes (): Promise<Record<string, number>> {
    return Object.fromEntries([...this.files].map(([name, bytes]) => [name, bytes.byteLength]))
  }

  async forget (name: string): Promise<void> {
    this.files.delete(name)
  }
}
