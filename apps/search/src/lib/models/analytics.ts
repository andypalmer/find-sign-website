import { mathWrite, readFile, type MathOperation } from "@find-sign/data-io/data-io.ts"
import { times } from "@find-sign/core/functions/iters.ts"
import { fn } from "@find-sign/core/models/filename-codec.ts"
import { AnalyticsTopics, type Topic } from "#lib/models/analytics-topics.ts"
export { isValidAnalyticsTopic, type Topic } from "#lib/models/analytics-topics.ts"

type AnalyticJob = {
  filename: string,
  bucketLength: number,
  operations: MathOperation[]
}

const AnalyticsJobs: { [key: string]: AnalyticJob } = {}

const AnalyticsWriteInterval = 30_000

// analytics is switched off until it has a backend that works with a static data server
// (writes need find-sign-data's math operation)
const AnalyticsEnabled = false

// log a hit to one of the analytics stores
export async function recordAnalytics (topic: Topic, value = 1) {
  if (!AnalyticsEnabled) return
  const now = new Date()
  const year = now.getUTCFullYear()
  const yearStart = Date.UTC(year, 0, 1, 0, 0, 0, 0)
  const nextYearStart = Date.UTC(year + 1, 0, 1, 0, 0, 0, 0)
  const filename = fn`analytics/${year}/${topic}.u16`
  const minutesSinceYearStart = Math.floor((now.getTime() - yearStart) / 60_000)
  const bucketLength = Math.floor((nextYearStart - yearStart) / 60_000)

  const jobName = `${topic}#${year}`
  const operation: MathOperation = {
    address: minutesSinceYearStart,
    operator: 'add',
    operand: value
  }

  if (AnalyticsJobs[jobName]) {
    const job = AnalyticsJobs[jobName]
    const compatibleOp = job.operations.find(x => x.operator === operation.operator && x.address === operation.address)
    if (compatibleOp) {
      compatibleOp.operand += operation.operand
    } else {
      AnalyticsJobs[jobName].operations.push(operation)
    }
  } else {
    const job = AnalyticsJobs[jobName] = {
      filename,
      bucketLength,
      operations: [operation]
    }

    setTimeout(async () => {
      delete AnalyticsJobs[jobName]
      await mathWrite(job.filename, job.bucketLength, 'u16', job.operations)
    }, AnalyticsWriteInterval)
  }
}

export async function readAnalyticsYear (topic: Topic, year: number): Promise<Uint16Array> {
  if (!AnalyticsEnabled) return new Uint16Array()
  const valueSize = 2
  const filename = fn`analytics/${year}/${topic}.u16`
  const fileData = await readFile(filename)
  if (!fileData) {
    const yearStart = Date.UTC(year, 0, 1, 0, 0, 0, 0)
    const yearEnd = Date.UTC(year + 1, 0, 1, 0, 0, 0, 0) - 1
    const minutes = new Uint16Array(Math.round((yearEnd - yearStart) / 60_000))
    return minutes
  }
  const dataView = new DataView(fileData.buffer, fileData.byteOffset, fileData.byteLength)
  const values = Uint16Array.from(times(fileData.byteLength / valueSize, index => {
    return dataView.getUint16(index * valueSize, false)
  }))

  return values
}

export async function listAnalyticsTopics () {
  return [...AnalyticsTopics]
}
