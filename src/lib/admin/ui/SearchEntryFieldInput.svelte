<script lang="ts">
  import TagsInput from 'svelte-tags-input'
  import { nanoid } from 'nanoid'

  export let type: string //'string' | 'string[]' | 'text' | 'boolean' | 'url' | 'nav' | 'author' | 'provider' | 'encoded-media[]' | 'encoded-media' | 'epochMs'
  export let name: string = nanoid()
  export let value: any
  export let autocomplete: string[] = []
  export let label: string = ''

  function onTags (event) {
    value = [...event.detail.tags]
  }

  function toDatetime (epoch: number): string {
    var isoString = (new Date(epoch)).toISOString()
    return isoString.substring(0, (isoString.indexOf("T")|0) + 6|0)
  }

  function fromDatetime (event: Event & { currentTarget: HTMLInputElement }) {
    const date = new Date(event.currentTarget.value)
    value = date.getTime()
  }
</script>
{#if type === 'string'}
  <input type="text" bind:value={value} id={name} name={name}>
{:else if type === 'string[]'}
  <TagsInput
    id={name}
    name={name}
    tags={value}
    addKeys={[13, 108, 32]}
    onlyUnique
    autoComplete={autocomplete}
    on:tags={onTags} />
{:else if type === 'text'}
  <textarea bind:value={value} id={name} name={name}></textarea>
{:else if type === 'boolean'}
  <input type="checkbox" id={name} name={name} bind:checked={value}><label for={name}> {label}</label>
{:else if type === 'url'}
  <input type="url" id={name} name={name} bind:value={value}>
{:else if type === 'epochMs'}
  <input
    type="datetime-local"
    id={name} name={name}
    value={toDatetime(value)}
    on:change={fromDatetime}
    pattern={'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}'}>
{:else}
  {JSON.stringify(value)} (editing unimplemented)
{/if}
<style>
  input[type=text], input[type=url] {
    width: 100%;
  }
</style>