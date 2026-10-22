// The order signs are shown in as discoveries: newest to Find Sign first, a day of indexing at a time, and within
// a day newest at their source first, so a batch of signs found together shows in the order their sites added
// them. Days are counted back from the last sign added, rather than by calendar, so a run that crosses midnight
// stays together. Each day's signs are dated by its last added sign, and signs whose source doesn't say when it
// made them come after the rest of their day.
const day = 24 * 60 * 60 * 1000

type Dated = { timestamp?: number, sourceCreated?: number, sourceUpdated?: number }

/** entries with a timestamp, in discovery order, each with the date it's shown under */
export function inDiscoveryOrder<Entry extends Dated> (entries: readonly Entry[]): { entry: Entry, date: number }[] {
  const indexed = entries.filter((entry): entry is Entry & { timestamp: number } => !!entry.timestamp && entry.timestamp > 0)
  const latest = Math.max(...indexed.map(entry => entry.timestamp))
  const dayOf = (entry: { timestamp: number }) => Math.floor((latest - entry.timestamp) / day)
  const lastAdded = new Map<number, number>()
  for (const entry of indexed) lastAdded.set(dayOf(entry), Math.max(lastAdded.get(dayOf(entry)) ?? 0, entry.timestamp))
  const sourceDate = (entry: Entry) => entry.sourceCreated ?? entry.sourceUpdated ?? -Infinity
  return indexed
    .map(entry => ({ entry, day: dayOf(entry), source: sourceDate(entry) }))
    .sort((a, b) => a.day - b.day || (b.source === a.source ? 0 : b.source - a.source) || b.entry.timestamp - a.entry.timestamp)
    .map(({ entry, day }) => ({ entry, date: lastAdded.get(day)! }))
}

/** the same order, with each day's providers taking turns, so one provider's big day doesn't fill a page: each
 * provider's signs keep their order, and the provider with the day's first sign goes first */
export function interleavingProviders<Entry> (ordered: readonly { entry: Entry, date: number }[], providerOf: (entry: Entry) => string): { entry: Entry, date: number }[] {
  const result: { entry: Entry, date: number }[] = []
  // a day's signs are together, and each day has its own date
  for (let start = 0; start < ordered.length;) {
    let end = start
    while (end < ordered.length && ordered[end].date === ordered[start].date) end++
    const queues = new Map<string, { entry: Entry, date: number }[]>()
    for (const item of ordered.slice(start, end)) {
      const provider = providerOf(item.entry)
      if (!queues.has(provider)) queues.set(provider, [])
      queues.get(provider)!.push(item)
    }
    for (let turn = 0; result.length < end; turn++) {
      for (const queue of queues.values()) if (turn < queue.length) result.push(queue[turn])
    }
    start = end
  }
  return result
}
