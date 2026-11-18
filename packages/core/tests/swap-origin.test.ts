import { describe, expect, it } from 'vitest'
import { swapOrigin } from '../src/functions/swap-origin.ts'

describe('swapOrigin', () => {
  it('puts the internal origin in place of the public one and keeps the path', () => {
    expect(swapOrigin('https://data.example.test/collections/find-sign/raw/index/manifest.json', 'http://data:8080'))
      .toBe('http://data:8080/collections/find-sign/raw/index/manifest.json')
  })

  it('keeps the query string', () => {
    expect(swapOrigin('https://data.example.test/a/b.json?license=abc', 'http://data:8080')).toBe('http://data:8080/a/b.json?license=abc')
  })
})
