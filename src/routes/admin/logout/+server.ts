import type { RequestHandler } from './$types'

export const GET: RequestHandler = ({ cookies }) => {
  cookies.delete('token', { path: '/' })
  return new Response('', { status: 307, headers: { 'Location': '/' } })
}
