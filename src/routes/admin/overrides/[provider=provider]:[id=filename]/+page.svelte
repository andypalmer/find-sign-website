<script lang="ts">
  import type { PageData } from './$types'
  import OverrideEditor from '#lib/admin/ui/OverrideEditor.svelte'

  export let data: PageData

  $: console.log(data.override)
</script>
<OverrideEditor entry={data.entry} bind:override={data.override} />
