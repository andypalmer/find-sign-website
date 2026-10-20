<script lang=ts>
  import type { PageData } from "./$types"

  export let data: PageData
</script>
Hey there “{data.username}”. You have rights to {data.powers.length === 0 ? 'do nothing' : data.powers.join(', ')}.

<a href="/logout">Logout</a>