import { expect, describe, it, afterEach, vi } from 'vitest'
import { get } from 'svelte/store'
import watchMedia from '../src/lib/functions/media-store.js'

function fakeMatchMedia (initial: { [query: string]: boolean }) {
  const lists = new Map<string, { matches: boolean, listeners: Set<() => void> }>()
  const matchMedia = (query: string) => {
    if (!lists.has(query)) lists.set(query, { matches: !!initial[query], listeners: new Set() })
    const list = lists.get(query)!
    return {
      get matches () { return list.matches },
      addEventListener: (_type: string, fn: () => void) => list.listeners.add(fn),
      removeEventListener: (_type: string, fn: () => void) => list.listeners.delete(fn),
    }
  }
  const change = (query: string, matches: boolean) => {
    const list = lists.get(query)!
    list.matches = matches
    for (const fn of list.listeners) fn()
  }
  return { matchMedia, change, listenerCount: (query: string) => lists.get(query)?.listeners.size ?? 0 }
}

describe('/src/lib/functions/media-store.ts', () => {
  afterEach(() => { delete (globalThis as any).window })

  it('reports no matches and empty classNames during SSR', () => {
    expect(get(watchMedia({ phone: '(max-width: 600px)' }))).toEqual({ classNames: '' })
  })

  it('reports each named query and media- classNames for matches', () => {
    const fake = fakeMatchMedia({ '(max-width: 600px)': true, '(prefers-color-scheme: dark)': false })
    vi.stubGlobal('window', { matchMedia: fake.matchMedia })
    const store = watchMedia({ phone: '(max-width: 600px)', dark: '(prefers-color-scheme: dark)' })
    expect(get(store)).toEqual({ phone: true, dark: false, classNames: 'media-phone' })
  })

  it('updates when a query changes, and stops listening when unsubscribed', () => {
    const fake = fakeMatchMedia({ '(max-width: 600px)': false })
    vi.stubGlobal('window', { matchMedia: fake.matchMedia })
    const values: any[] = []
    const unsubscribe = watchMedia({ phone: '(max-width: 600px)' }).subscribe(v => values.push(v))
    fake.change('(max-width: 600px)', true)
    expect(values.at(-1)).toEqual({ phone: true, classNames: 'media-phone' })
    unsubscribe()
    expect(fake.listenerCount('(max-width: 600px)')).toBe(0)
  })
})
