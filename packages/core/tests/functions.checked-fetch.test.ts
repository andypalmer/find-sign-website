import { describe, expect, it } from 'vitest'
import { checkedFetch } from '../src/functions/checked-fetch.ts'

describe('checkedFetch()', () => {
  it('asks the server every time, so a copy the browser stored earlier can\'t go on being used', async () => {
    const seen: (RequestInit | undefined)[] = []
    const fetch = checkedFetch((async (_url: RequestInfo | URL, init?: RequestInit) => { seen.push(init); return new Response('ok') }) as typeof globalThis.fetch)
    await fetch('https://data.example/wordvec/info.json')
    await fetch('https://data.example/wordvec/2222.lps', { mode: 'cors' })
    expect(seen.map(init => init?.cache)).toEqual(['no-cache', 'no-cache'])
  })

  it('keeps the other settings the caller gave, and hands the request on unchanged', async () => {
    let received: RequestInit | undefined
    const fetch = checkedFetch((async (_url: RequestInfo | URL, init?: RequestInit) => { received = init; return new Response('ok') }) as typeof globalThis.fetch)
    await fetch('https://data.example/x', { mode: 'cors', headers: { Accept: 'application/json' } })
    expect(received).toMatchObject({ mode: 'cors', headers: { Accept: 'application/json' }, cache: 'no-cache' })
  })

  it('does not change the settings object the caller passed in', async () => {
    const init: RequestInit = { mode: 'cors' }
    const fetch = checkedFetch((async () => new Response('ok')) as typeof globalThis.fetch)
    await fetch('https://data.example/x', init)
    expect(init).toEqual({ mode: 'cors' })
  })

  it('gives back the response it was given', async () => {
    const response = new Response('the answer')
    const fetch = checkedFetch((async () => response) as typeof globalThis.fetch)
    expect(await fetch('https://data.example/x')).toBe(response)
  })
})
