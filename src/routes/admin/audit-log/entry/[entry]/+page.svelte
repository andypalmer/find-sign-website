<script lang="ts">
  import { humane } from "#lib/functions/date.ts"
  import MainBlock from "#lib/MainBlock.svelte"
  import { encodeFilename } from "#lib/models/filename-codec.ts"
  import type { PageData } from "./$types"

  export let data: PageData
</script>

<h1>Audit Log data</h1>

<MainBlock wide>
  <h1><a href="/admin/users/{encodeURIComponent(data.actor)}">{data.actor}</a> performed <code>{data.actionType}</code></h1>
  <p><code>{data.message}</code></p>
  {#if data.extra}
    <div>
      {#if data.extra.publicURL}
        <div>Public URL: <a href={data.extra.publicURL}>{data.extra.publicURL}</a></div>
      {/if}
      {#if data.extra.adminURL}
        <div>Admin URL: <a href={data.extra.adminURL}>{data.extra.adminURL}</a></div>
      {/if}
      {#if data.extra.index}
        <div>Index: <a href={`/sign/${encodeFilename(data.extra.index)}`}>{data.extra.index}</a></div>
      {/if}
      {#if data.extra.index && data.extra.entryID}
        <div>data ID: <a href={`/sign/${encodeFilename(data.extra.index)}/${encodeFilename(data.extra.entryID)}`}>{data.extra.entryID}</a></div>
      {/if}
      {#if data.extra.object}
        <pre><code>{JSON.stringify(data.extra.object, null, 2)}</code></pre>
      {/if}
    </div>
  {/if}
  <p><time>{humane(data.time)} {(new Date(data.time)).toLocaleTimeString()}</time></p>
</MainBlock>
