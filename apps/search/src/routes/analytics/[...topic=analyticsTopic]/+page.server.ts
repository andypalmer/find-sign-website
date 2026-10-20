import { chunk, times } from '@find-sign/core/functions/iters.ts'
import { isValidAnalyticsTopic, readAnalyticsYear } from '#lib/models/analytics.ts'
import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

// average a list of equal length blocks of minute counts, minute by minute
// returns size zeros when there are no blocks (no recorded hits)
function averageBlocks (blocks: ArrayLike<number>[], size: number): number[] {
  const totals = [...times(size, () => 0)]
  for (const block of blocks) {
    for (let index = 0; index < size; index++) totals[index] += block[index] || 0
  }
  return totals.map(total => total / Math.max(blocks.length, 1))
}

export const load: PageServerLoad = async ({ params, url }) => {
  const year = parseInt(url.searchParams.get('year') || `${(new Date).getUTCFullYear()}`, 10)
  const topic = params.topic
  if (isValidAnalyticsTopic(topic)) {
    const data = await readAnalyticsYear(topic, year)
    const days = chunk(data, 60 * 24).map(values => {
      return values.reduce((prev, curr) => prev + curr, 0)
    })

    const daysWithData = chunk(data, 60 * 24).filter(block =>
      block.some(x => x !== 0)
    )

    const avgDayMinutes = averageBlocks(daysWithData, 60 * 24)

    // in 5 min blocks
    const avgDay = chunk(avgDayMinutes, 5).map(block =>
      block.reduce((prev, curr) => prev + curr, 0)
    )

    const yearStart = new Date(Date.UTC(year, 0))
    const mondayOffset = ((9 - yearStart.getDay()) % 7) * 60 * 24
    const weeksWithData = chunk(data.slice(mondayOffset), 60 * 24 * 7).filter(block =>
      block.some(x => x !== 0)
    )
    const avgWeekMinutes = averageBlocks(weeksWithData, 60 * 24 * 7)

    const avgWeek = chunk(avgWeekMinutes, 60).map(hourMins =>
      hourMins.reduce((prev, curr) => prev + curr)
    )

    // console.log(avgWeek, JSON.stringify(avgWeek))//

    // rotate week until starts on Sunday
    const firstMomentInYear = new Date(Date.UTC(year, 0))
    const firstDay = firstMomentInYear.getDay()
    if (firstDay !== 0) {
      avgWeek.push(...avgWeek.splice(0, firstDay * 24))
    }

    return { topic, year, days, avgDay, avgWeek, maxAge: 60000 }
  } else {
    error(500, 'invalid topic')
  }
}
