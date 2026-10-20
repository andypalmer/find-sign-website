import { redirect } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

// admin pages used to live under /admin on the public site; audit log entries still link there
export const GET: RequestHandler = ({ params, url }) => {
  redirect(308, `/${params.path}${url.search}`)
}
