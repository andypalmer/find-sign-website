<script lang="ts">
  import type { PageData } from './$types'
  import { fn } from '@find-sign/core/models/filename-codec.ts'

  export let data: PageData
</script>
<ul>
  {#each data.overrides as { provider, id }}
    <li><a href={fn`/overrides/${provider}:${id}`}>{provider}: {id}</a></li>
  {/each}
</ul>
