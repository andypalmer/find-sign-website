import { expect, describe, it } from 'vitest'
import { isNaughty } from '../src/search/naughty.ts'

describe('isNaughty()', () => {
  it('goes by register, not topic', () => {
    expect(isNaughty({ tags: ['auslan-signbank', 'lexis.crude'] })).toBe(true)
    expect(isNaughty({ tags: ['asphyxia', 'register.explicit'] })).toBe(true)
    expect(isNaughty({ tags: ['spread-the-sign', 'register.suggestive'] })).toBe(true)
    expect(isNaughty({ tags: ['auslan-signbank', 'semantic.sexuality'] })).toBe(false)
    expect(isNaughty({})).toBe(false)
  })
})
