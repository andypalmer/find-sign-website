import { describe, expect, it } from 'vitest'
import { addressForTheWorker, indexFolderOf, settingsFromTheWorkersAddress, type WorkerSettings } from '../src/worker/worker-settings.ts'

const settings: WorkerSettings = {
  dataUrl: 'https://data.example/collections/find-sign/raw/',
  indexName: 'v2',
  indexes: ['auslan-signbank', 'signpedia', 'spread-the-sign-auslan'],
  vectorLibraryUrl: 'https://data.example/collections/wordvec/raw/commoncrawl-english-300'
}
const script = 'https://beta.example/service-worker.js'
const withParam = (name: string, value: string | undefined) => {
  const url = new URL(addressForTheWorker(script, settings))
  if (value === undefined) url.searchParams.delete(name); else url.searchParams.set(name, value)
  return url.toString()
}

describe('the worker\'s address', () => {
  it('starts with the script the page asked for, and carries the settings', () => {
    const address = addressForTheWorker(script, settings)
    expect(address.startsWith(`${script}?`)).toBe(true)
    expect(address.length).toBeGreaterThan(script.length + 20)
  })

  it('gives back exactly the settings it was made from, with the indexes in the same order', () => {
    expect(settingsFromTheWorkersAddress(addressForTheWorker(script, settings))).toEqual(settings)
    const reversed = { ...settings, indexes: [...settings.indexes].reverse() }
    expect(settingsFromTheWorkersAddress(addressForTheWorker(script, reversed))?.indexes).toEqual(reversed.indexes)
  })

  it('works with a path as the script address, as the page will have it', () => {
    expect(settingsFromTheWorkersAddress(`https://beta.example${addressForTheWorker('/service-worker.js', settings)}`)).toEqual(settings)
  })

  it('is a different address when any setting is different, so the browser installs the worker again', () => {
    const base = addressForTheWorker(script, settings)
    expect(addressForTheWorker(script, { ...settings, indexName: 'index' })).not.toBe(base)
    expect(addressForTheWorker(script, { ...settings, indexes: ['signpedia'] })).not.toBe(base)
    expect(addressForTheWorker(script, { ...settings, dataUrl: 'https://other.example/raw/' })).not.toBe(base)
    expect(addressForTheWorker(script, { ...settings, vectorLibraryUrl: 'https://other.example/vectors' })).not.toBe(base)
  })

  it('says nothing when a setting is missing, rather than starting half set up', () => {
    for (const name of ['data', 'index', 'indexes', 'vectors']) {
      expect(settingsFromTheWorkersAddress(withParam(name, undefined)), name).toBeUndefined()
      expect(settingsFromTheWorkersAddress(withParam(name, '')), name).toBeUndefined()
    }
    expect(settingsFromTheWorkersAddress(script)).toBeUndefined()
  })

  it('refuses a data address or word vector address that is not a web address', () => {
    for (const bad of ['/collections/find-sign/raw/', 'collections', 'file:///etc/', 'javascript:alert(1)', 'ftp://data.example/']) {
      expect(settingsFromTheWorkersAddress(withParam('data', bad)), bad).toBeUndefined()
      expect(settingsFromTheWorkersAddress(withParam('vectors', bad)), bad).toBeUndefined()
    }
  })

  it('refuses an index folder or index name that is not one plain name, because names go on the end of the data address', () => {
    for (const bad of ['../x', 'a/b', '.', '..', 'a b', 'a?b', 'https://elsewhere.example']) {
      expect(settingsFromTheWorkersAddress(withParam('index', bad)), bad).toBeUndefined()
      expect(settingsFromTheWorkersAddress(withParam('indexes', `signpedia,${bad}`)), bad).toBeUndefined()
    }
  })

  it('refuses an empty list of indexes, and one with an empty name in it', () => {
    expect(settingsFromTheWorkersAddress(withParam('indexes', ','))).toBeUndefined()
    expect(settingsFromTheWorkersAddress(withParam('indexes', 'signpedia,,asphyxia'))).toBeUndefined()
  })
})

describe('indexFolderOf()', () => {
  it('is the data address and the index folder, with one slash between them', () => {
    expect(indexFolderOf(settings)).toBe('https://data.example/collections/find-sign/raw/v2')
    expect(indexFolderOf({ ...settings, dataUrl: 'https://data.example/collections/find-sign/raw' })).toBe('https://data.example/collections/find-sign/raw/v2')
  })
})
