import type { LayoutServerLoad } from "./$types"

export const load: LayoutServerLoad = (event) => {
  return {
    session: {
      username: event.locals.username
    }
  }
}