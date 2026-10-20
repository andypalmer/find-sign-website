<script lang="ts">
  import type { PageData } from './$types'
  import SearchEntryViewer from '#lib/ui/SearchEntryViewer.svelte'

  export let data: PageData
  $: ({ provider, id, entry } = data)
</script>
<h1>{provider}: {id}</h1>

<SearchEntryViewer {entry} />
