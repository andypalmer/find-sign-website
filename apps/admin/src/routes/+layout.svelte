<script lang="ts">
  import type { LayoutData } from "./$types"
  import '@find-sign/core/app.css'

  export let data: LayoutData
  $: ({ session } = data)
</script>

<svelte:head>
  <meta name=viewport content="width=device-width">
  <title>Find Sign Admin</title>
</svelte:head>

<div class="layout">
  <nav class="sidebar">
    <h1>Admin Controls</h1>

    <a href="/login">Login</a>
    <a href="/logout">Logout</a>
    <a href="/audit-log">Audit Log</a>

    {#if session.username}
      <a href="/">Admin Home</a>
      <a href="/indexes">Search Indexes</a>
      <a href="/users">User Management</a>
    {/if}
  </nav>
  <main class="content">
    <slot/>
  </main>
</div>


<style>
  .layout {
    display: grid;
    grid-template-areas: "sidebar content";
    grid-template-columns: 250px auto;
    min-height: calc(100vh - 16px);
  }

  .sidebar {
    grid-area: sidebar;
    border-right: 1px solid currentColor;
    padding-left: 1ex;
  }

  .content {
    grid-area: content;
    padding-left: 1ex;
  }

  .sidebar h1 {
    font-size: 1.5em;
    font-weight: lighter;
  }

  .sidebar a {
    display: block;
  }

  @media (max-width: 600px) {
    .layout {
      grid-template-areas: "sidebar" "content";
      grid-template-columns: auto;
    }
  }
</style>