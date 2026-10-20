import { expect, describe, it, afterEach, vi } from 'vitest'
import { get } from 'svelte/store'
import persistentWritable from '../src/lib/functions/persistent-store.js'

function fakeStorage (initial: { [key: string]: string } = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key: string) => data.has(key) ? data.get(key) : null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) },
  }
}

describe('/src/lib/functions/persistent-store.ts', () => {
  afterEach(() => { delete globalThis.localStorage })

  it('acts as a plain writable during SSR', () => {
    const store = persistentWritable('k', 'initial')
    expect(get(store)).toBe('initial')
    store.set('changed')
    expect(get(store)).toBe('changed')
  })

  it('stores the initial value when nothing is stored yet', () => {
    const storage = fakeStorage()
    vi.stubGlobal('localStorage', storage)
    expect(get(persistentWritable('region', false))).toBe(false)
    expect(storage.data.get('region')).toBe('false')
  })

  it('starts from the stored value', () => {
    vi.stubGlobal('localStorage', fakeStorage({ region: '"vic"' }))
    expect(get(persistentWritable<string | false>('region', false))).toBe('vic')
  })

  it('resets to the initial value when the stored value is not valid JSON', () => {
    const storage = fakeStorage({ username: 'not json' })
    vi.stubGlobal('localStorage', storage)
    expect(get(persistentWritable('username', ''))).toBe('')
    expect(storage.data.get('username')).toBe('""')
  })

  it('persists set and update', () => {
    const storage = fakeStorage()
    vi.stubGlobal('localStorage', storage)
    const store = persistentWritable('count', 1)
    store.set(5)
    expect(storage.data.get('count')).toBe('5')
    store.update(n => n + 1)
    expect(get(store)).toBe(6)
    expect(storage.data.get('count')).toBe('6')
  })
})
