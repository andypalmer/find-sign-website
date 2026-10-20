<script lang=ts>
  import type { PageData } from './$types'
  import ProgressLogViewer from '#lib/progress/ProgressLogViewer.svelte'
  import { fn } from '@find-sign/core/models/filename-codec.ts'
  import delay from '@find-sign/core/functions/delay.ts'

  export let data: PageData

  let rebuilding: { [index: string]: { endpoint: string, id: string, finished: boolean } } = {}

  async function rebuild (event: Event, index: string, opts: { fast?: boolean }) {
    event.preventDefault()
    if (rebuilding[index]) {
      console.log('already rebuilding...')
    } else {
      const endpoint = fn`/indexes/${index}/build?` + (opts.fast ? 'fast=1' : '')
      const response = await fetch(endpoint, { method: 'POST', body: '' })
      const json = await response.json()
      rebuilding[index] = { endpoint, id: json.progress.id, finished: false }
      rebuilding = rebuilding
    }
  }

  async function validate (event: Event, index: string) {
    event.preventDefault()

    if (rebuilding[index]) {
      console.log('already running...')
    } else {
      const endpoint = fn`/indexes/${index}/validate`
      const response = await fetch(endpoint, { method: 'POST', body: '' })
      const json = await response.json()
      rebuilding[index] = { endpoint, id: json.progress.id, finished: false }
      rebuilding = rebuilding
    }
  }

  function indexURL (index: string) {
    return fn`/indexes/${index}`
  }

  async function buildFinished (index: string) {
    rebuilding[index].finished = true
    rebuilding = rebuilding

    await delay(10 * 1000)
    delete rebuilding[index]
    rebuilding = rebuilding
  }
</script>
<ul>
  {#each data.availableIndexes as index}
    <li>
      <a href={indexURL(index)}>{index}</a>
      <div>
        <span class="controls">
          {#if rebuilding[index] && rebuilding[index].finished === false}
            [building...]
          {:else}
            [<a href="#update-{index}" on:click={(event) => rebuild(event, index, { fast: true })}>update</a>,
            <a href="#rebuild-{index}" on:click={(event) => rebuild(event, index, { fast: false })}>rebuild</a>,
            <a href="#validate-{index}" on:click={(event) => validate(event, index)}>validate</a>]
          {/if}
        </span>

        {#if rebuilding[index]}
          <ProgressLogViewer
            endpoint={rebuilding[index].endpoint}
            id={rebuilding[index].id}
            on:finished={() => buildFinished(index)} />
        {/if}
      </div>
    </li>
  {/each}
</ul>

<style>
  .controls { opacity: 0.5 }
</style>
