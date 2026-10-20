<script lang=ts>
  import type { PageData } from "./$types";

  export let data: PageData
</script>
<ul>
  {#each data.usernames as user}
    <li><a href="/users/{user}">{user}</a></li>
  {/each}
</ul>