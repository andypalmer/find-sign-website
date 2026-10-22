// stores a value for a given duration, then reverts to undefined if it hasn't been updated recently enough
export default function cache (durationSecs = 60) {
  let stored:any = undefined
  let timeout: ReturnType<typeof setTimeout> | undefined = undefined

  return {
    get: () => stored,
    set: (value: any) => {
      if (timeout) clearTimeout(timeout)
      stored = value
      timeout = setTimeout(() => stored = undefined, (durationSecs * 1000))
      return value
    }
  }
}

/**
 * returns the last value immediately, then updates for the next request
 * if called again before update returns a new value, old value keeps being returned
 */
export function immediateResponseCache<Ret, Args extends any[]> (loadNewValue: (...args: Args) => Promise<Ret>): (...args: Args) => Promise<Ret> {
  let nextPromise: Promise<Ret>
  let initialized = false
  let updating = false

  return (...args) => {
    if (!updating) {
      updating = true
      const next = loadNewValue(...args)
      if (initialized) {
        next.then(x => {
          updating = false
          nextPromise = Promise.resolve(x)
        }).catch(err => {
          updating = false
          nextPromise = Promise.reject(err)
          // only the requests that get it handle it: until then, it mustn't count as unhandled, which stops node
          nextPromise.catch(() => {})
        })
      } else {
        initialized = true
        nextPromise = next
        // both ways, so a failed first load only fails its request, and isn't an unhandled rejection too
        next.then(() => updating = false, () => updating = false)
      }
    }

    return nextPromise
  }
}
