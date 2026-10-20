<script lang="ts">
  export let type: string //'string' | 'string[]' | 'text' | 'boolean' | 'url' | 'nav' | 'author' | 'provider' | 'encoded-media[]' | 'encoded-media' | 'epochMs'
  export let value: any
  export let label: string = ''
</script>
{#if value === undefined}
  unset
{:else if type === 'string'}
  {value}
{:else if type === 'string[]'}
  {value.join(', ')}
{:else if type === 'text'}
  <pre>{value}</pre>
{:else if type === 'boolean'}
  {value ? '✅' : '❌'} {label}
{:else if type === 'url'}
  <a href={value} rel="external">{value}</a>
{:else if type === 'nav'}
  <ol>
    {#each value as [label, link]}<li><a href={link} rel="external">{label}</a></li>{/each}
  </ol>
{:else if type === 'epochMs'}
  {(new Date(value)).toLocaleString()}
{:else if type === 'author'}
  <div class="author">
    {#if value.avatar}<img src={value.avatar} alt="avatar">{/if}
    <div class="username">@{value.id || '[id not set]'}</div>
    <div class="name">“{value.name || '[name not set]'}”</div>
    {#if value.link}
      <div class="link"><a href={value.link} rel="external">{value.link}</a></div>
    {:else}
      <div class="link">[link not set]</div>
    {/if}
  </div>
{:else if type === 'provider'}
  <div class="provider">
    <a href={value.link || '#link-not-set'}>@{value.id || '[id not set]'} ({value.name || '[name not set]'})</a> {value.verb || '[verb not set]'} ...
  </div>
{:else}
  <pre><code>{JSON.stringify(value, null, 2)}</code></pre>
{/if}
<style>
  pre, pre code {
    word-wrap: break-word;
  }
  .author {
    display: grid;
    grid-template-areas:
      "avatar username"
      "avatar name"
      "avatar link";
    grid-template-columns: 3em auto;
  }
  .author img { grid-area: avatar }
  .author .username { grid-area: username }
  .author .name { grid-area: name }
  .author .link { grid-area: link }
</style>