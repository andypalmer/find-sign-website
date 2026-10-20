<script lang=ts>
  import { goto } from '$app/navigation'
  import PasskeyForm from '#lib/passkey/PasskeyForm.svelte'
  import usernameStore from '#lib/models/username-store.ts'

  function onAuthenticated (...args) {
    console.log('onAuthenticated', ...args)
    goto('/admin')
  }
</script>
<p>
  Admin access is given to a few trusted people, whose actions are carefully
  recorded for accountability. Administrators may be given power to adjust the
  content of search results to correct technical glitches that sometimes occur
  in how this website downloads information from it's various source websites.
</p>
<p>
  Administrators may also have the ability to manually remove specific search
  results, and create and manage other kinds of data used by the website to
  create educational games and other future content.
</p>
<PasskeyForm endpoint={'/admin/login/passkey'} on:authenticated={onAuthenticated} bind:username={$usernameStore} />
