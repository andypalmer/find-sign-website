<script lang="ts">
  import type { AuditLogEntry } from "#lib/models/audit-log.ts"
  import { humane } from "#lib/functions/date.ts"
  import MainBlock from "#lib/MainBlock.svelte"
  import Paginator from "#lib/Paginator.svelte"
  import { encodeFilename } from "#lib/models/filename-codec.ts"
  import type { PageData } from "./$types"

  export let data: PageData
  $: ({ pageEntries, currentPage, totalPages } = data)

  // group entries by day, with humane headings
  function dateGrouped (entries: AuditLogEntry[]) {
    const grouped: { timeString: string, entries: AuditLogEntry[] }[] = []
    for (const entry of entries) {
      const timestamp = new Date(entry.timeMs)
      const timeString = humane(timestamp)
      if (grouped.length === 0 || grouped[0].timeString !== timeString) {
        grouped.unshift({
          timeString,
          entries: [entry]
        })
      } else {
        grouped[0].entries.unshift(entry)
      }
    }
    return grouped
  }
</script>

<h1>Audit Log</h1>

<MainBlock wide>
  {#if pageEntries.length === 0}
    <p>No Audit Log entries found</p>
  {/if}
  {#each dateGrouped(pageEntries) as { timeString, entries } }
    <h4>{timeString}</h4>
    {#each entries as entry}
      <p>
        <a href="/admin/users/{encodeURIComponent(entry.actor)}">{entry.actor}</a>
        {entry.message}
        [<a href="/admin/audit-log/entry/{encodeURIComponent(entry.filename)}">...</a>]
      </p>
    {/each}
  {/each}
</MainBlock>

<Paginator length={totalPages} selected={currentPage} let:page>{page + 1}</Paginator>
