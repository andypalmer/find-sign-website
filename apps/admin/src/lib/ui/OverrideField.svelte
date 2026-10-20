<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import SearchEntryFieldInput from './SearchEntryFieldInput.svelte'
  import SearchEntryField from './SearchEntryField.svelte'

  export let name: string
  export let type: string
  export let value: any = undefined
  export let label: string = ''
  export let autocomplete: string[] = []
  export let override: boolean = false

  const fire = createEventDispatcher()
  $: fire('change', { override, value })
</script>

<td><label for={name}>{name}</label></td>
<td class="value">
  <input type="checkbox" class="override" name="{name}-override" bind:checked={override}>
  {#if override}
    <SearchEntryFieldInput
      {name} {type} {label} {autocomplete}
      bind:value={value}/>
  {:else}
    <SearchEntryField {type} {value} {label}/>
  {/if}
</td>
<style>
  .value {
    display: grid;
    grid-template-columns: max-content auto;
  }
</style>