// A pretend shelf for the file keeper's tests: remembers files in memory, and writes down what was asked.
import type { IRememberFilesByName } from '@find-sign/core/worker/file-keeper.ts'

export class FakeShelf implements IRememberFilesByName {
  files = new Map<string, Uint8Array>()
  /** every name that was looked up, in order */
  recalled: string[] = []

  async recall (name: string): Promise<Uint8Array | undefined> {
    this.recalled.push(name)
    return this.files.get(name)
  }

  async remember (name: string, bytes: Uint8Array): Promise<void> {
    this.files.set(name, bytes)
  }

  async names (): Promise<string[]> {
    return [...this.files.keys()]
  }

  async forget (name: string): Promise<void> {
    this.files.delete(name)
  }
}
