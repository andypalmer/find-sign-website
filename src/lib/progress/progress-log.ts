// as sveltekit doesn't support eventstream yet, long polling is the only practical option
// to stream out updates to client side. This structure allows a long running server side process
// to respond with a progress ID, and then subsequent requests can ask for the next update until
// the process is complete.
// notably used in /admin/indexes/.../build
import { type RequestEvent } from '@sveltejs/kit'
import { nanoid } from 'nanoid'

type ProgressReport = {
  id: string, // unique string to identify which progress stream
  progress?: number, // from 0.0 to 1.0, absent if this report has no new progress
  logs: { timestamp: number, log?: any[] }[], // log lines since previous update
  finished: boolean, // when this turns true, the stream is finished and consumer should unsubscribe
  index?: number, // incrementing index for report
}

type ProgressReporter = (reporter: { progress: (value: number) => void, log: (...things: any[]) => void }) => Promise<any>
type ProgressUpdate = {
  timestamp: number,
  log?: any[],
  progress?: number,
  finished?: true,
}
type SubscriptionCB = () => void

const inProgress: { [id: string]: ProgressUpdate[] } = {}
const subscribers: { [id: string]: SubscriptionCB[] } = {}

export function createProgressLog (cb: ProgressReporter): ProgressReport {
  const id = nanoid()
  inProgress[id] = [{ timestamp: Date.now() }]
  subscribers[id] = []

  const setProgress = (progress: number) => {
    if (inProgress[id]) inProgress[id].push({ timestamp: Date.now(), progress })
    if (subscribers[id]) while (subscribers[id].length > 0) subscribers[id].shift()?.()
  }

  const doLog = (...things: any[]) => {
    if (inProgress[id]) inProgress[id].push({ timestamp: Date.now(), log: things })
    if (subscribers[id]) while (subscribers[id].length > 0) subscribers[id].shift()?.()
  }

  const output = cb({ progress: setProgress, log: doLog })
  if (output && typeof output === 'object' && typeof output.then === 'function') {
    output.then(() => {
      if (inProgress[id]) inProgress[id].push({ timestamp: Date.now(), progress: 1.0, finished: true })
      if (subscribers[id]) while (subscribers[id].length > 0) subscribers[id].shift()?.()
    }).catch(reason => {
      if (reason instanceof Error) reason = reason.stack || reason.message
      if (inProgress[id]) inProgress[id].push({ timestamp: Date.now(), log: [`Error: ${reason}`], finished: true })
      if (subscribers[id]) while (subscribers[id].length > 0) subscribers[id].shift()?.()
    })
  } else {
    if (inProgress[id]) inProgress[id].push({ timestamp: Date.now(), progress: 1.0, finished: true })
  }

  return sliceUpdates(id, 0)
}

function sliceUpdates (id: string, index: number): ProgressReport {
  let report: ProgressReport & { index: number } = { id, index, progress: undefined, logs: [], finished: false }
  if (id in inProgress) {
    for (const entry of inProgress[id].slice(index)) {
      if ('log' in entry) report.logs.push({ timestamp: entry.timestamp, log: entry.log })
      if (entry.progress !== undefined) report.progress = entry.progress
      if ('finished' in entry) {
        report.finished = true
        setTimeout(() => {
          delete inProgress[id]
          if (subscribers[id]) {
            while (subscribers[id].length > 0) subscribers[id].shift()?.()
            delete subscribers[id]
          }
        }, 1000 * 60)
      }
      report.index += 1
    }
  } else {
    report.progress = 1
    report.finished = true
  }
  return report
}

export async function nextUpdate (id: string, index: number): Promise<ProgressReport> {
  if (inProgress[id]) {
    if (inProgress[id].length <= index) {
      await new Promise(resolve => {
        if (subscribers[id]) {
          subscribers[id].push(() => resolve(undefined))
        } else {
          resolve(undefined)
        }
      })
    }
    return sliceUpdates(id, index)
  } else {
    return { id, progress: 1, logs: [], finished: true }
  }
}

// supports both Event Stream and long polling response types
export async function nextUpdateResponse (event: RequestEvent): Promise<Response> {
  const id = event.url.searchParams.get('id') ?? ''

  const accept = event.request.headers.get('Accept') || ''
  if (accept === 'text/event-stream') {
    const lastEventID = event.request.headers.get('Last-Event-ID')
    let lastIndex = lastEventID ? parseInt(lastEventID) : -1
    return new Response(new ReadableStream({
      start (controller) {
        if (!inProgress[id]) {
          // send back an immediate finished response
          controller.enqueue('event: finished\n data: true\n\n')
          controller.close()
        }
      },
      async pull (controller) {
        const updates = inProgress[id]
        if (updates) {
          const catchup = updates.slice(lastIndex + 1)
          for (const update of catchup) {
            lastIndex += 1

            if (update.progress) {
              controller.enqueue(`event:progress\ndata:${JSON.stringify(Math.round(update.progress * 10000) / 10000)}\nid:${JSON.stringify(lastIndex)}\n\n`)
            }
            if (update.log) {
              controller.enqueue(`event:log\ndata:${JSON.stringify(update.log)}\nid:${JSON.stringify(lastIndex)}\n\n`)
            }
            if (update.finished) {
              controller.enqueue(`event:finished\ndata:${JSON.stringify(update.finished)}\nid:${JSON.stringify(lastIndex)}\n\n`)
              controller.close()
              delete inProgress[id]
              delete subscribers[id]
              return
            }
          }

          // wait for next update
          await new Promise(resolve => {
            if (subscribers[id]) {
              subscribers[id].push(() => resolve(undefined))
            } else {
              resolve(undefined)
            }
          })
        } else {
          // send back an immediate finished response
          controller.enqueue('event:finished\ndata: true\n\n')
          controller.close()
        }
      }
    }), { headers: { 'Content-Type': 'text/event-stream' } })
  } else {
    const index = event.url.searchParams.get('index')
    return Response.json(await nextUpdate(id, parseInt(index ?? '')))
  }
}