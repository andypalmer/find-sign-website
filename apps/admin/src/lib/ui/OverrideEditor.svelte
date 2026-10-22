<script lang="ts">
  import type { IndexOverride } from '#lib/models/index-override.ts'
  import type { EncodedSearchDataEntry } from '@find-sign/core/orthagonal/types.ts'
  import { createEventDispatcher } from 'svelte'

  import OverrideField from './OverrideField.svelte'

  export let entry: EncodedSearchDataEntry
  export let override: IndexOverride

  const fire = createEventDispatcher()

  // fields are looked up by name
  const entryFields = entry as { [field: string]: any }
  const overrideFields = override as { [field: string]: any }

  const knownTags = [
    'established', 'invented', 'description'
  ]

  type Field = {
    name: string,
    type: 'string' | 'string[]' | 'text' | 'boolean' | 'url' | 'nav' | 'author' | 'provider' | 'encoded-media[]' | 'encoded-media' | 'epochMs',
    label?: string,
    autocomplete?: string[],
    override?: boolean,
    value?: any
  }

  const fields: Field[] = [
    { name: 'id', type: 'string' },
    { name: 'published', type: 'boolean', label: 'include in search results'},
    { name: 'title', type: 'string' },
    { name: 'words', type: 'string[]' },
    { name: 'tags', type: 'string[]', autocomplete: knownTags },
    { name: 'body', type: 'text' },
    { name: 'link', type: 'url' },
    { name: 'nav', type: 'nav' },
    { name: 'author', type: 'author' },
    { name: 'provider', type: 'provider' },
    { name: 'media', type: 'encoded-media[]' },
    { name: 'timestamp', type: 'epochMs' }
  ]

  for (const field of fields) {
    if (field.name in override) {
      field.override = true
      field.value = overrideFields[field.name] || undefined
    } else {
      field.override = false
      field.value = entryFields[field.name] || undefined
    }
  }

  function updateOverride () {
    for (const field of fields) {
      if (!field.override) field.value = entryFields[field.name] || undefined
    }
    override = Object.fromEntries(fields.filter(x => x.override).map(x => [x.name, x.value]))
    fire('change', { override })
  }
</script>
<table>
  <thead><tr>
    <td>Field</td>
    <td>Override Value</td>
  </tr></thead>
  <tbody>
    {#each fields as field, idx}
      <tr>
        <OverrideField {...field} on:change={(event) => {
          if (fields[idx].value !== event.detail.value || fields[idx].override !== event.detail.override) {
            fields[idx].value = event.detail.value
            fields[idx].override = event.detail.override
            updateOverride()
          }
        }}/>
      </tr>
    {/each}
  </tbody>
</table>
<style>
  table {
    width: 100%;
  }
  table :global(td) {
    vertical-align: top;
  }
  table :global(td:first-child) {
    text-align: right;
  }
</style>
