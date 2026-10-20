import { writable, type Writable } from 'svelte/store'

// writable store persisted as JSON in localStorage under key
// starts from the stored value if there is a readable one, otherwise stores and uses initialValue
// during SSR (no localStorage) it behaves like a plain writable
// (replaces svelte-persistent-writable, which only supports svelte 3)
export default function persistentWritable<T> (key: string, initialValue: T): Writable<T> {
  const storage = typeof localStorage === 'undefined' ? undefined : localStorage
  const save = (value: T) => storage?.setItem(key, JSON.stringify(value))

  let value = initialValue
  try {
    const stored = storage?.getItem(key)
    if (stored === null || stored === undefined) {
      save(initialValue)
    } else {
      value = JSON.parse(stored)
    }
  } catch (err) {
    // unparseable stored value, start over
    save(initialValue)
  }

  const store = writable(value)
  return {
    subscribe: store.subscribe,
    set: (newValue) => {
      save(newValue)
      store.set(newValue)
    },
    update: (updater) => {
      store.update(oldValue => {
        const newValue = updater(oldValue)
        save(newValue)
        return newValue
      })
    },
  }
}
