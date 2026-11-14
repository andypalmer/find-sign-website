// A pretend clock for tests: stands still until a test moves it.
import type { IReadTheTime } from '@find-sign/core/worker/file-keeper.ts'

export class FakeClock implements IReadTheTime {
  constructor (private time = Date.UTC(2026, 0, 1)) {}

  now (): number {
    return this.time
  }

  /** move on by this many days */
  passDays (days: number): void {
    this.time += days * 24 * 60 * 60 * 1000
  }
}
