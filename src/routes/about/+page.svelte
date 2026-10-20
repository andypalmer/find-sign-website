<script lang="ts">
  import type { PageData } from './$types'
  import Header from '#lib/header/Header.svelte'
  import HiddenEmail from '#lib/HiddenEmail.svelte'
  import MainBlock from '#lib/MainBlock.svelte'
  import { onMount } from 'svelte'
  import clientRecordAnalytics from '#lib/models/client-record-analytics.ts'

  export let data: PageData

  function searchURL (query) {
    return `/search?${new URLSearchParams(Object.entries({ query, page: 0 }))}`
  }

  onMount(() => {
    clientRecordAnalytics('about', fetch)
  })
</script>

<svelte:head>
  <title>Find Sign - About</title>
</svelte:head>

<Header/>

<MainBlock wide={true}>
  <h1>What is this?</h1>
  <p>
    This website is a search engine. It gathers videos from trusted people and organisations and gives
    you good quality, reliable answers for how different ideas can be signed in parts of Australia.
    Artificial Intelligence language translation systems are used to help the computer better understand
    the real meaning of signs, and not just look up which english words match perfectly.
  </p>
  <p>
    Try any English word or phrase. This website will try to understand what the word means, and find sign
    videos with similar meaning. It's different to how other Auslan search systems work. You don’t need
    to type the same words the authors of sign videos used in their English descriptions. If the meaning is
    similar, it should find it! For example, if you search for fruit, it will show you lots of videos about
    different kinds of fruit, as well as signs for “fruit” as a group concept.
  </p>
  <h1>What are the goals?</h1>
  <ol>
    <li>Help make a world where more people know Auslan</li>
    <li>Help improve communication for people who got language deprived</li>
    <li>Promote real Auslan grammar, not signed english styles</li>
    <li>
      Encourage people to try real Auslan and not only use Key Word Sign or other
      language depriving alternative communication systems with disabled people
    </li>
    <li>
      To help people out in rural areas who can't easily get to Auslan classes to at
      least learn some basics
    </li>
    <li>Make it easier for students to improve their vocabulary</li>
  </ol>
  <h1>Who made it?</h1>
  <p>
    Deaf, Hard of Hearing, and students, mostly in the inner west of Sydney, collaborated,
    designed, and built it together. Prototypes were tested at Auslan social events for about 6
    months before it's initial release happened at Inner West Auslan Social in 2019.
  </p>
  <h1>How to use it best?</h1>
  <p>
    The simplest thing is to type some words in to the search box, and see signs from all around Australia.
    But Find Sign can do some more advanced searches:
  </p>
  <p>
    #hashtags allow you to limit the search results, so only results with the tags you asked for appear.
    Every search result has a list of #hashtags under the web link. You can put any of these in to the
    search box, and then your results will only be ones which include every hashtag you searched for.
    For example, you can search for “<a href={searchURL('#asphyxia')}>#asphyxia</a>” to only see results
    from Asphyxia's youtube series, or “<a href={searchURL('#qld')}>#qld</a>” to only see results which
    are listed as being used in Queensland. You can also search for a hashtag, with a minus in front of
    it, like “<a href={searchURL('-#toddslan')}>-#toddslan</a>” to show results which <em>do not include</em>
    #toddslan. This can be very powerful with Auslan Signbank searches. You can search for
    “<a href={searchURL('#signbank #phonology.symmetrical')}>#signbank #phonology.symmetrical</a>” to find
    results where both hands do the same thing.
  </p>
  <p>
    @usernames work like hashtags on some results, like those from Auslan Anywhere, you might
    also see @usernames listed along side the hashtags. You can enter these @usernames in to the search box
    just like hashtags to narrow your search. Usernames aren't working on every site yet, but importing from
    instagram and youtube is planned to be added later.
  </p>
  <h1>What are all the #hashtags?</h1>
  <ul>
    {#each data.hashtags as { hashtag, count }}
      {#if count > 1}
        <li><a href={searchURL(`#${hashtag}`)} rel="nofollow">#{hashtag}</a> <span>({count} videos)</span></li>
      {/if}
    {/each}
  </ul>
  <h1>And all the @usernames?</h1>
  <ul>
    {#each data.usernames as { username, count }}
      {#if count > 0}
        <li><a href={searchURL(`@${username}`)} rel="nofollow">@{username}</a> <span>({count} videos)</span></li>
      {/if}
    {/each}
  </ul>

  <h1>How can I contact the admins?</h1>
  <p>
    Email <HiddenEmail user=find domain=auslan.fyi /> with your feedback.
  </p>
</MainBlock>
<style>
  ul {
    display: grid;
    grid-template-columns: repeat(2, 50%);
  }

  ul li {
    list-style: none;
  }

  ul li span {
    opacity: 40%;
  }

  @media (max-width: 600px) {
    ul { grid-template-columns: 100% }
  }
</style>
