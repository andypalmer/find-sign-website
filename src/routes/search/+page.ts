import type { PageLoad } from './$types'
import { redirect } from '@sveltejs/kit'
import { search } from '$lib/search/search'
import clientRecordAnalytics from '$lib/models/client-record-analytics'
import { browser } from '$app/environment'

const resultsPerPage = 10
const maxPages = 9

export const load: PageLoad = async ({ url, fetch }) => {
  const query = url.searchParams.get('query') || ''
  const page = parseInt(url.searchParams.get('page') || '0')
  const region = url.searchParams.get('r')

  // empty queries go home!
  if (query.trim() === '') throw redirect(301, '/');

  let actualQuery = region ? `#${region} (${query})` : query
  const { results, totalResults } = await search(actualQuery, page * resultsPerPage, resultsPerPage)
  const totalPages = Math.min(maxPages, Math.ceil(totalResults / resultsPerPage))

  if (browser && !url.searchParams.has('automated')) {
    clientRecordAnalytics('search', fetch)
  }

  return {
    query,
    page,
    results,
    totalPages,
    region: region || false,
    viewport: url.searchParams.get('vp') === 'm' ? 'mobile' : 'desktop'
  }
}
