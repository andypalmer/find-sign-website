import { expect, describe, it } from 'vitest'
import rank from '../src/search/search-rank.ts'

type Fake = { id: string, indexURL: string, tags: string[], score: number }

const sign = (id: string, score = 1, indexURL = 'https://data.test/alpha'): Fake => ({ id, indexURL, tags: [], score })
const library = (indexes: { [name: string]: Fake[] }): any => Object.fromEntries(Object.entries(indexes).map(([name, entries]) => [name, { entries }]))
const idsOf = (ranked: { entries: any[] }) => ranked.entries.map(entry => entry.id)
const byScore = (entry: any) => entry.score

describe('rank()', () => {
  it('puts signs that rank equally in id order, whatever order the library lists them in', () => {
    const ids = ['dog', 'cat', 'emu', 'ant', 'bee']
    const forwards = rank(library({ alpha: ids.map(id => sign(id)) }), byScore)
    const backwards = rank(library({ alpha: [...ids].reverse().map(id => sign(id)) }), byScore)
    expect(idsOf(forwards)).toEqual(['ant', 'bee', 'cat', 'dog', 'emu'])
    expect(idsOf(backwards)).toEqual(idsOf(forwards))
  })

  it('puts equal-ranked signs from different indexes in the order the indexes are listed in, then by id within each', () => {
    const ranked = rank(library({
      alpha: [sign('dog'), sign('ant')],
      beta: [sign('cat', 1, 'https://data.test/beta'), sign('bee', 1, 'https://data.test/beta')]
    }), byScore)
    // beta's "bee" has the earlier id than alpha's "dog", but alpha is listed first
    expect(idsOf(ranked)).toEqual(['ant', 'dog', 'bee', 'cat'])
  })

  it('follows the order the indexes are listed in, so listing beta first puts its signs first', () => {
    const ranked = rank(library({
      beta: [sign('cat', 1, 'https://data.test/beta'), sign('bee', 1, 'https://data.test/beta')],
      alpha: [sign('dog'), sign('ant')]
    }), byScore)
    expect(idsOf(ranked)).toEqual(['bee', 'cat', 'ant', 'dog'])
  })

  it('still puts a better rank first, however late its id comes', () => {
    const ranked = rank(library({ alpha: [sign('ant', 2), sign('zebra', 1), sign('bee', 2)] }), byScore)
    expect(idsOf(ranked)).toEqual(['zebra', 'ant', 'bee'])
  })

  it('puts equal-ranked signs with the same id in the order their indexes are listed in', () => {
    const inBeta = sign('cat', 1, 'https://data.test/beta')
    const inAlpha = sign('cat', 1, 'https://data.test/alpha')
    expect(rank(library({ beta: [inBeta], alpha: [inAlpha] }), byScore).entries.map(entry => entry.indexURL))
      .toEqual(['https://data.test/beta', 'https://data.test/alpha'])
    expect(rank(library({ alpha: [inAlpha], beta: [inBeta] }), byScore).entries.map(entry => entry.indexURL))
      .toEqual(['https://data.test/alpha', 'https://data.test/beta'])
  })

  it('lets a better rank beat a better place in the list, so the order of the indexes only settles ties', () => {
    const ranked = rank(library({ alpha: [sign('ant', 2)], beta: [sign('zebra', 1, 'https://data.test/beta')] }), byScore)
    expect(idsOf(ranked)).toEqual(['zebra', 'ant'])
  })

  it('compares ids by their characters, not by the viewer\'s language, so every machine agrees', () => {
    // a locale-aware compare puts "a" before "B"; comparing characters puts every capital first
    const ranked = rank(library({ alpha: [sign('a'), sign('B')] }), byScore)
    expect(idsOf(ranked)).toEqual(['B', 'a'])
  })

  it('leaves out signs that do not match at all', () => {
    const ranked = rank(library({ alpha: [sign('ant', Infinity), sign('bee', 1)] }), byScore)
    expect(idsOf(ranked)).toEqual(['bee'])
  })
})
