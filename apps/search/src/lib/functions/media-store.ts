import { readable, type Readable } from 'svelte/store'

export type MediaState<Name extends string> = { classNames: string } & { [name in Name]?: boolean }

// store tracking which of a set of named css media queries currently match, e.g.
// watchMedia({ phone: '(max-width: 600px)' }) -> { phone: true, classNames: 'media-phone' }
// during SSR the queries are absent (undefined), and classNames is ''
// (replaces svelte-media, which only supports svelte 3)
export default function watchMedia<Name extends string> (queries: { [name in Name]: string }): Readable<MediaState<Name>> {
  return readable({ classNames: '' } as MediaState<Name>, (set) => {
    if (typeof window === 'undefined') return

    const lists = Object.entries<string>(queries).map(([name, query]) => [name, window.matchMedia(query)] as const)
    const update = () => {
      const state = { classNames: '' } as MediaState<Name>
      const classNames: string[] = []
      for (const [name, list] of lists) {
        ;(state as { [name: string]: boolean | string })[name] = list.matches
        if (list.matches) classNames.push(`media-${name}`)
      }
      state.classNames = classNames.join(' ')
      set(state)
    }

    for (const [, list] of lists) list.addEventListener('change', update)
    update()
    return () => {
      for (const [, list] of lists) list.removeEventListener('change', update)
    }
  })
}
