import { expect, describe, it } from 'vitest'
import { inDiscoveryOrder, interleavingProviders } from '../src/lib/search/discovery-order.ts'

const hour = 60 * 60 * 1000
const now = Date.parse('2026-10-22T03:00:00.000Z')
const order = (entries: { id: string, timestamp?: number, sourceCreated?: number, sourceUpdated?: number }[]) =>
  inDiscoveryOrder(entries).map(({ entry, date }) => [entry.id, date])

describe('inDiscoveryOrder()', () => {
  it('shows the newest day of indexing first, and within a day the newest at the source first', () => {
    expect(order([
      { id: 'old-run', timestamp: now - 30 * hour, sourceCreated: Date.parse('2026-10-01') },
      { id: 'made-2019', timestamp: now - 5 * hour, sourceCreated: Date.parse('2019-01-01') },
      { id: 'made-2024', timestamp: now - 2 * hour, sourceCreated: Date.parse('2024-01-01') },
      { id: 'changed-2021', timestamp: now, sourceUpdated: Date.parse('2021-01-01') },
    ])).toEqual([
      ['made-2024', now], ['changed-2021', now], ['made-2019', now],
      ['old-run', now - 30 * hour],
    ])
  })

  it('counts days back from the last sign added, so a run that crosses midnight stays together', () => {
    const lastNight = Date.parse('2026-10-21T23:30:00.000Z')
    expect(order([
      { id: 'before-midnight', timestamp: lastNight, sourceCreated: 1 },
      { id: 'after-midnight', timestamp: lastNight + hour, sourceCreated: 2 },
    ])).toEqual([['after-midnight', lastNight + hour], ['before-midnight', lastNight + hour]])
  })

  it('puts signs whose source doesn\'t date them after the rest of their day, newest found first, and leaves out signs without a timestamp', () => {
    expect(order([
      { id: 'undated', timestamp: now - hour },
      { id: 'undated-later', timestamp: now },
      { id: 'never-indexed' },
      { id: 'dated', timestamp: now - 2 * hour, sourceCreated: Date.parse('2019-01-01') },
    ])).toEqual([['dated', now], ['undated-later', now], ['undated', now]])
  })
})

describe('interleavingProviders()', () => {
  it('has each day\'s providers take turns, keeping each one\'s order, the provider with the day\'s first sign first', () => {
    const day1 = 2000, day2 = 1000
    const ordered = [
      ['a:1', day1], ['a:2', day1], ['a:3', day1], ['b:1', day1], ['c:1', day1], ['b:2', day1],
      ['b:3', day2], ['a:4', day2],
    ].map(([entry, date]) => ({ entry: entry as string, date: date as number }))
    expect(interleavingProviders(ordered, entry => entry.split(':')[0]).map(({ entry }) => entry)).toEqual([
      'a:1', 'b:1', 'c:1', 'a:2', 'b:2', 'a:3',
      'b:3', 'a:4',
    ])
  })
})
