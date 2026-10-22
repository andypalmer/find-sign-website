<script lang="ts">
  // A sign's tags, explained. On a search result: its warnings and its first few tags, with a link to the rest. On
  // the sign's own page: every tag, grouped, with the provider's own tags last.
  import TagChip from './TagChip.svelte'
  import { groupTags } from './tag-groups.ts'

  export let tags: string[]
  export let provider: { id?: string, name?: string } | undefined = undefined
  /** every tag, in groups, as on the sign's page */
  export let full = false
  /** where the rest of the tags are, on a search result */
  export let permalink: string | undefined = undefined
  /** the result's key, keeping the explanations' ids apart */
  export let key = 0
  /** how many tags a search result shows, after its warnings */
  export let shown = 4

  $: sorted = groupTags(tags, provider)
  // on a search result, the region map already says where a sign is used
  $: brief = sorted.groups.filter(group => group.name !== 'Where it’s used').flatMap(group => group.tags)
</script>

{#if full}
  <div class="tag-groups">
    {#if sorted.warnings.length}
      <span class="name">Note</span><span class="chips">{#each sorted.warnings as tag}<TagChip {tag} {key} warning/>{/each}</span>
    {/if}
    {#each sorted.groups as group}
      <span class="name">{group.name}</span><span class="chips">{#each group.tags as tag}<TagChip {tag} {key}/>{/each}</span>
    {/each}
    {#if sorted.provider}
      <span class="name provider">{sorted.provider.name}</span><span class="chips provider">{#each sorted.provider.tags as tag}<TagChip {tag} {key}/>{/each}</span>
    {/if}
  </div>
{:else}
  <span class="tag-line">
    {#each sorted.warnings as tag}<TagChip {tag} {key} warning/> {/each}
    {#each brief.slice(0, shown) as tag}<TagChip {tag} {key}/> {/each}
    {#if brief.length > shown}
      {#if permalink}<a class="more" href={permalink}>+{brief.length - shown} more</a>{:else}<span class="more">+{brief.length - shown} more</span>{/if}
    {/if}
  </span>
{/if}

<style>
  .tag-groups { display: grid; grid-template-columns: max-content 1fr; gap: 0.4em 1em; align-items: baseline; }
  .chips { display: flex; flex-wrap: wrap; gap: 0.3em; }
  .name { opacity: 0.7; }
  .provider { opacity: 0.75; }
  .tag-line :global(.chip) { margin-right: 0.3em; }
  .more { opacity: 0.7; color: inherit; }
  @media (max-width: 600px) {
    .tag-groups { grid-template-columns: 1fr; row-gap: 0.2em; }
    .chips { margin-bottom: 0.4em; }
  }
</style>
