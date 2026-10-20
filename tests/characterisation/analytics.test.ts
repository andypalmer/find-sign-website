// Tests for the analytics page loader's aggregation of per-minute hit counters.
import '../helpers/test-env'
import { expect, describe, it, vi, beforeEach } from 'vitest'
import { isHttpError } from '@sveltejs/kit'

const readAnalyticsYear = vi.fn()
vi.mock('../../src/lib/models/analytics', async () => {
  const actual: any = await vi.importActual('../../src/lib/models/analytics')
  return { ...actual, readAnalyticsYear: (...args: any[]) => readAnalyticsYear(...args) }
})

const { load } = await import('../../src/routes/analytics/[...topic=analyticsTopic]/+page.server')

const MinutesPerDay = 60 * 24
const yearOfMinutes = () => new Uint16Array(365 * MinutesPerDay)
const event = (topic = 'search') => ({ params: { topic }, url: new URL('http://site.test/analytics/search?year=2026') }) as any
const sum = (list: number[]) => list.reduce((a, b) => a + b, 0)

beforeEach(() => readAnalyticsYear.mockReset())

describe('analytics page load', () => {
  it('renders empty charts for a year with no hits (a missing counter file reads as all zeros)', async () => {
    readAnalyticsYear.mockResolvedValue(yearOfMinutes())
    const page: any = await load(event())
    expect(page.days).toHaveLength(365)
    expect(page.days.every((x: number) => x === 0)).toBe(true)
    expect(page.avgDay).toEqual(new Array(288).fill(0))
    expect(page.avgWeek).toEqual(new Array(168).fill(0))
  })

  it('renders empty charts when analytics reads are disabled (empty data)', async () => {
    readAnalyticsYear.mockResolvedValue(new Uint16Array())
    const page: any = await load(event())
    expect(page.days).toEqual([0])
    expect(page.avgDay).toEqual(new Array(288).fill(0))
    expect(page.avgWeek).toEqual(new Array(168).fill(0))
  })

  it('sums days, and averages minutes over only the days and weeks that have hits', async () => {
    const data = yearOfMinutes()
    data[0] = 3 // day 0, 00:00
    data[MinutesPerDay] = 1 // day 1, 00:00
    data[MinutesPerDay + 10] = 2 // day 1, 00:10
    data[100 * MinutesPerDay] = 1 // day 100, 00:00
    readAnalyticsYear.mockResolvedValue(data)
    const page: any = await load(event())

    expect(page.days.slice(0, 2)).toEqual([3, 3])
    expect(page.days[100]).toBe(1)
    expect(sum(page.days)).toBe(7)

    // 3 days have hits: 00:00-00:04 averages (3 + 1 + 1) / 3, 00:10-00:14 averages 2 / 3
    expect(page.avgDay[0]).toBeCloseTo(5 / 3)
    expect(page.avgDay[2]).toBeCloseTo(2 / 3)
    expect(sum(page.avgDay)).toBeCloseTo(7 / 3)

    // days 0 and 1 fall before the first full week, so only day 100's week counts
    expect(page.avgWeek).toHaveLength(168)
    expect(sum(page.avgWeek)).toBeCloseTo(1)
    expect(page).toMatchObject({ topic: 'search', year: 2026, maxAge: 60000 })
  })

  it('throws a 500 for an invalid topic', async () => {
    const thrown = await Promise.resolve().then(() => load(event('nope'))).catch(err => err)
    expect(isHttpError(thrown, 500)).toBe(true)
    expect(thrown.body).toEqual({ status: 500, message: 'invalid topic' })
    expect(readAnalyticsYear).not.toHaveBeenCalled()
  })
})
