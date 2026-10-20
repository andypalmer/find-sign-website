// the analytics topics, kept free of imports so src/params.ts can use them (see the note there)
export type Topic = 'homepage' | 'search' | 'permalink' | 'random' | 'about' | 'technology' | 'discord/search' | 'discord/random'

export const AnalyticsTopics = ['homepage', 'search', 'permalink', 'random', 'about', 'technology', 'discord/search', 'discord/random']

export function isValidAnalyticsTopic (topic: string): topic is Topic {
  return AnalyticsTopics.includes(topic)
}
