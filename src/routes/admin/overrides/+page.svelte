<script lang="ts">
  import type { PageData } from './$types'
  import { fn } from '#lib/models/filename-codec.ts'

  export let data: PageData
</script>
<ul>
  {#each data.overrides as { provider, id }}
    <li><a href={fn`/admin/overrides/${provider}:${id}`}>{provider}: {id}</a></li>
  {/each}
</ul>
