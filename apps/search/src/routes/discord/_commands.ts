export const AuslanCommand = {
  name: 'auslan',
  description: 'Lookup an Auslan sign using find.auslan.fyi search',
  type: 1,
  options: [
    {
      name: 'query',
      description: 'Enter your search query to run on find.auslan.fyi',
      required: true,
      type: 3
    }
  ]
}

export const AuslanRandomCommand = {
  name: 'random-auslan',
  description: 'Post a random Auslan vocab video, from find.auslan.fyi',
  type: 1
}

export default [AuslanCommand, AuslanRandomCommand]