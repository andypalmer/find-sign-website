// Rude, explicit and suggestive signs: left off the front page and out of random signs, and ranked after the other
// signs that match a search as well. Only register counts, not topic: semantic.sexuality also covers gay, lesbian,
// transgender, pregnant and birth
export const naughtyTags = [
  'lexis.crude',
  'register.explicit',
  'register.suggestive',
]

export function isNaughty ({ tags }: { tags?: string[] }): boolean {
  return (tags ?? []).some(tag => naughtyTags.includes(tag))
}
