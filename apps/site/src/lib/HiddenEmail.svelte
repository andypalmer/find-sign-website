<script lang="ts">
  export let proto: string = 'mailto'
  export let user: string
  export let domain: string

  let href = '#send-email'

  function doMailto (event: Event) {
    event.preventDefault()
    location.href = `${proto}:${user}@${domain}`
  }

  function setHref () {
    href = `${proto}:${user}@${domain}`
  }
</script>
<!-- svelte-ignore a11y-invalid-attribute -->
<a href={href} on:focus={setHref} on:mouseover={setHref} on:click={doMailto}
><slot><span data-u={user} data-d={domain}>@</span></slot
></a>
<style>
  span::before {
    content: attr(data-u);
  }
  span::after {
      content: attr(data-d);
  }
</style>