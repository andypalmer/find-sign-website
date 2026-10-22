// A sign's tags, sorted for showing: warnings first, then what Find Sign's vocabulary says about the sign, in
// groups from most to least useful to a learner, then the provider's own tags. Each tag carries its label and
// meaning from the vocabulary, for explaining it.
import { canonicalTag, mappings } from '@andypalmer/tags'

export type ShownTag = {
  /** the tag as it's searched for: #semantic.food */
  id: string,
  label: string,
  meaning?: string,
  /** who the tag's meaning comes from */
  from?: 'Auslan Signbank' | 'Find Sign',
}

export type TagGroup = { name: string, tags: ShownTag[] }

export type ShownTags = {
  /** rude and sexual signs: shown on every result, as they explain why a sign ranks lower */
  warnings: ShownTag[],
  groups: TagGroup[],
  /** the provider's own tags, which only it explains */
  provider: TagGroup | undefined,
}

export const warningTags = ['lexis.crude', 'register.explicit', 'register.suggestive']

const regions = ['everywhere', 'northern', 'southern', 'act', 'nsw', 'nt', 'qld', 'sa', 'tas', 'vic', 'wa']

// groups in the order they're shown, each with the vocabulary tags it holds
const groups: { name: string, holds: (id: string) => boolean }[] = [
  { name: 'Topic', holds: id => id.startsWith('semantic.') },
  { name: 'Part of speech', holds: id => id.startsWith('pos.') },
  { name: 'Status', holds: id => id.startsWith('lexis.') || ['phrasal', 'example', 'idiom', 'invented', 'described'].includes(id) },
  { name: 'Language', holds: id => id.startsWith('language.') },
  { name: 'Where it’s used', holds: id => regions.includes(id) },
  { name: 'Form', holds: id => /^(phonology|morph|iconicity)\./.test(id) },
  { name: 'Who uses it', holds: id => id.startsWith('religion.') },
]

/** a vocabulary tag, ready to show */
export function shownTag (id: string): ShownTag | undefined {
  const tag = canonicalTag(id)
  return tag && {
    id,
    label: tag.label,
    ...(tag.meaning && { meaning: tag.meaning }),
    from: tag.from === 'signbank' ? 'Auslan Signbank' : 'Find Sign',
  }
}

/** a sign's tags, sorted for showing. The provider's tags are named for it, without its namespace; the tag naming
 * the provider is left out, as the sign already says where it's from */
export function groupTags (tags: readonly string[], provider?: { id?: string, name?: string }): ShownTags {
  const mapping = provider?.id ? mappings.get(provider.id) : undefined
  const warnings: ShownTag[] = []
  const grouped = new Map<string, ShownTag[]>()
  const own: ShownTag[] = []
  for (const id of tags) {
    if (mapping?.own.includes(id)) continue
    const tag = shownTag(id)
    if (!tag) {
      const prefix = mapping && `${mapping.namespace}.`
      own.push({ id, label: prefix && id.startsWith(prefix) ? id.slice(prefix.length).replace(/-/g, ' ') : id })
    } else if (warningTags.includes(id)) {
      warnings.push(tag)
    } else {
      const group = groups.find(group => group.holds(id))?.name ?? 'Other'
      grouped.set(group, [...(grouped.get(group) ?? []), tag])
    }
  }
  const order = [...groups.map(group => group.name), 'Other']
  return {
    warnings,
    groups: order.flatMap(name => grouped.has(name) ? [{ name, tags: grouped.get(name)! }] : []),
    provider: own.length ? { name: `${provider?.name ?? provider?.id ?? 'The provider'}’s tags`, tags: own } : undefined,
  }
}
