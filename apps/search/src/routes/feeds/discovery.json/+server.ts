import { getUpdatesFeed } from '../_read-discovery-feed'
import type { RequestHandler } from './$types'

export const prerender = false

export const GET: RequestHandler = async ({ url }) => {
  const page = parseInt(url.searchParams.get('page') || '0')
  const length = parseInt(url.searchParams.get('length') || '50')

  const body = await getUpdatesFeed({ url, page, length })

  return Response.json(body)
}