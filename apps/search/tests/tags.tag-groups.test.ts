import { expect, describe, it } from 'vitest'
import { groupTags } from '../src/lib/tags/tag-groups.ts'

const sts = { id: 'spread-the-sign-auslan', name: 'Spread the Sign' }

describe('groupTags()', () => {
  it('puts warnings first, then the vocabulary\'s groups in order, then the provider\'s own tags under its name', () => {
    const sorted = groupTags(['spread-the-sign', 'sts.interjection', 'pos.interjection', 'sts.profanity-slang', 'semantic.feel', 'lexis.crude'], sts)
    expect(sorted.warnings.map(tag => tag.id)).toEqual(['lexis.crude'])
    expect(sorted.groups.map(group => [group.name, group.tags.map(tag => tag.label)])).toEqual([
      ['Topic', ['feel']],
      ['Part of speech', ['interjection']],
    ])
    expect(sorted.provider).toEqual({ name: 'Spread the Sign’s tags', tags: [
      { id: 'sts.interjection', label: 'interjection' },
      { id: 'sts.profanity-slang', label: 'profanity slang' },
    ] })
  })

  it('explains vocabulary tags with their label, meaning and source', () => {
    const { groups } = groupTags(['nsw', 'lexis.regional', 'phonology.onehand'], { id: 'auslan-signbank', name: 'Auslan Signbank' })
    expect(groups).toEqual([
      { name: 'Status', tags: [{ id: 'lexis.regional', label: 'regional', meaning: 'used in some regions only', from: 'Auslan Signbank' }] },
      { name: 'Where it’s used', tags: [{ id: 'nsw', label: 'New South Wales', meaning: 'used in New South Wales', from: 'Find Sign' }] },
      { name: 'Form', tags: [{ id: 'phonology.onehand', label: 'onehand', meaning: 'made with one hand', from: 'Auslan Signbank' }] },
    ])
  })

  it('keeps tags of a provider without a mapping as they are', () => {
    expect(groupTags(['animal'], { id: 'alpha', name: 'Alpha' }).provider).toEqual({ name: 'Alpha’s tags', tags: [{ id: 'animal', label: 'animal' }] })
  })
})
