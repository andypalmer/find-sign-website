import delay from '#lib/functions/delay.ts'

export type ProgressReport = {
  progress?: number,
  log?: any[],
  finished?: boolean,
  timestamp?: number,
}

/** async iterator outputs progress stream over long polling endpoint from ./progress-log */
export default async function * progressConsumer (endpoint: string, id: string): AsyncIterable<ProgressReport> {
  // old long polling implementation
  // let index = 0
  // let finished = false
  // while (!finished) {
  //   const path = new URL(endpoint, location.href)
  //   path.searchParams.set('id', id)
  //   path.searchParams.set('index', `${index}`)
  //   const response = await fetch(path.toString())
  //   const json = await response.json()
  //   if ('index' in json) index = json.index
  //   if ('finished' in json) finished = json.finished
  //   if ('progress' in json) yield { progress: json.progress }
  //   if ('logs' in json && json.logs.length > 0) yield * json.logs
  //   await delay(15)
  // }

  const buffer = new TransformStream()
  const writer = buffer.writable.getWriter()
  const reader = buffer.readable.getReader()

  const path = new URL(endpoint, location.href)
  path.searchParams.set('id', id)
  const source = new EventSource(path)
  let timestamp = Date.now()
  source.addEventListener('log', event => writer.write({ log: JSON.parse(event.data) }))
  source.addEventListener('progress', event => writer.write({ progress: JSON.parse(event.data) }))
  source.addEventListener('timestamp', event => timestamp = JSON.parse(event.data))
  source.addEventListener('finished', event => {
    writer.write({ finished: true })
    writer.close()
    source.close()
  })

  while (true) {
    const result = await reader.read()
    if (result.value) {
      yield result.value
    }
    if (result.done) {
      reader.cancel()
      return
    }
  }
}
