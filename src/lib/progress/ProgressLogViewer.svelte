<script lang="ts">
  import { createEventDispatcher, onMount, tick } from 'svelte'
  import progressConsumer from '#lib/progress/progress-consumer.ts'

  export let endpoint: string
  export let id: string
  export let finished = false

  const dispatcher = createEventDispatcher()

  let progress: number = 0.0
  let log: {timestamp: number, message: string}[] = []
  let consoleEl: HTMLDivElement

  onMount(async () => {
    for await (const entry of progressConsumer(endpoint, id)) {
      if ('progress' in entry) progress = entry.progress
      if ('log' in entry) {
        log = [...log, {
          timestamp: entry.timestamp,
          message: entry.log.join(' ')
        }]
        tick().then(scrollConsole)
      }
    }
    finished = true
    log = [...log, { timestamp: Date.now(), message: 'Stream Complete' }]
    tick().then(scrollConsole)
    dispatcher('finished')
  })

  function scrollConsole () {
    if (consoleEl) {
      consoleEl.children[consoleEl.children.length - 1].scrollIntoView({
        behavior: 'auto',
        block: 'end',
        inline: 'start'
      })
    }
  }
</script>
<div class="task">
  <div class="progress-bar" style="--value: {progress * 100}%"></div>
  <div class="console" bind:this={consoleEl}>
    {#each log as { timestamp, message }}<div>{message}</div>{/each}
  </div>
</div>
<style>
  .task {
    border: currentColor;
    border-radius: 1ex;
  }

  .progress-bar {
    height: 1ex;
    background: linear-gradient(90deg, currentColor var(--value), transparent var(--value));
    border: 1px solid currentColor;
    border-radius: 0.5ex;
    margin: 1ex;
  }

  .console {
    height: 15em;
    padding: 1ex;
    overflow-y: scroll;
    font-family: monospace;
  }
</style>
