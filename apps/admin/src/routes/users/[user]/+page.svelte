<script lang=ts>
  import type { UserAccount } from "#lib/models/user.ts"
  import { chunk } from "@find-sign/core/functions/iters.ts"
  import type { PageData } from "./$types"

  export let data: PageData
  $: ({ user, username, canEdit } = data)

  let newPower = ''

  function removePower (power: string) {
    user.powers = user.powers.filter(p => p !== power)
  }

  async function update (event: SubmitEvent) {
    event.preventDefault()
    const response = await fetch('', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ powers: user.powers })
    })
    user = await response.json()
  }
</script>
<form on:submit={update}>
  <dl>
    <dt>Username</dt>
    <dd>{username}</dd>

    <dt>Powers</dt>
    <dd>
      <ul>
        {#each user.powers as power}
        <li>{power} <span on:click={() => removePower(power)}>❌</span></li>
        {/each}
        <input bind:value={newPower}>
        <input type="button" value="add power" on:click={() => {
          // @ts-ignore-error
          user.powers = [...user.powers, newPower]
          newPower = ''
          user = user
        }}>
      </ul>
    </dd>

    <dt>Account Created</dt>
    <dd>{(new Date(user.created)).toLocaleString()}</dd>

    {#each Object.entries(user.authenticators) as [id, config]}
      <dt>Authenticator: {id}</dt>
      <dd>
        <dl>
          {#each Object.entries(config) as [key, value]}
            <dt>{key}</dt>
            <dd><pre><code>{Array.isArray(value)
              ? chunk(value.map(x => `00${x.toString(16)}`.slice(-2)), 16).map(x => x.join(' ')).join('\n')
              : JSON.stringify(value)
            }</code></pre></dd>
          {/each}
        </dl>
      </dd>
    {/each}
  </dl>
  <button type=submit disabled={!canEdit}>Save Changes</button>
</form>
<style>
  li span { cursor: pointer }
</style>
