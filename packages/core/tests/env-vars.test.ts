import { expect, describe, it } from 'vitest'
import { required, optional, forbidden } from '../src/env-vars.ts'
import { filename, provider } from '../src/models/param-matchers.ts'

describe('setting validators', () => {
  it('required passes values through and rejects missing or empty ones', () => {
    expect(required('x')).toBe('x')
    expect(() => required(undefined)).toThrow('must be set')
    expect(() => required('')).toThrow('must be set')
  })

  it('optional turns empty into undefined', () => {
    expect(optional('x')).toBe('x')
    expect(optional('')).toBeUndefined()
    expect(optional(undefined)).toBeUndefined()
  })

  it('forbidden rejects any value', () => {
    expect(forbidden(undefined)).toBeUndefined()
    expect(forbidden('')).toBeUndefined()
    expect(() => forbidden('secret')).toThrow('must not be set')
  })
})

describe('param matchers', () => {
  it('provider only checks the shape of an id, since matchers cannot read settings', () => {
    expect(provider('anything-shaped-right')).toBe('anything-shaped-right')
    expect(provider('no/slashes')).toBeUndefined()
    expect(provider).toBe(filename)
  })
})
