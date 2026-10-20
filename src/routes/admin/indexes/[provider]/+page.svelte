<script lang="ts">
  import { fn } from "#lib/models/filename-codec.ts"
  import type { PageData } from "./$types"

  export let data: PageData
  $: ({ meta, entries, provider } = data)

  function url (provider, id) {
    return fn`/admin/indexes/${provider}/entries/${id}`
  }

</script>

<pre><code>{JSON.stringify(meta, null, 2)}</code></pre>

<ol>
  {#each entries as entry}
    <li><a href={url(provider, entry.id)}>{entry.id}: {entry.title}</a></li>
  {/each}
</ol>
