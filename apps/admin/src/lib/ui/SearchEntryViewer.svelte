<script lang="ts">
import type { EncodedSearchDataEntry } from '@find-sign/core/orthagonal/types.ts';

  import SearchEntryField from './SearchEntryField.svelte'

  export let entry: EncodedSearchDataEntry

  const fieldTypes: { [field: string]: string } = {
    id: 'string',
    published: 'boolean',
    title: 'string',
    words: 'string[]',
    tags: 'string[]',
    body: 'text',
    link: 'url',
    nav: 'nav',
    author: 'author',
    provider: 'provider',
    media: 'encoded-media[]',
    timestamp: 'epochMs'
  }
</script>
<dl>
  {#each Object.entries(entry) as [key, value]}
    <dt>{key}</dt>
    <dd><SearchEntryField type={fieldTypes[key]} {value} label="" /></dd>
  {/each}
</dl>

<style>
  dl {
    display: grid;
    grid-template-columns: max-content auto;
    grid-auto-rows: max-content max-content;
  }

  dl dt {
    grid-column: 1;
    text-align: right;
    padding-right: 1ex;
  }

  dl dd {
    grid-column: 2;
    margin: 0;
    padding-left: 1ex;
    border-left: 1px solid currentColor;
  }

  dl dt:not(:first-of-type), dl dd:not(:first-of-type) {
    border-top: 1px solid currentColor;
  }
</style>
