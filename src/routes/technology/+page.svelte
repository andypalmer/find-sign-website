<script lang="ts">
  import Header from '#lib/header/Header.svelte'
  import HiddenEmail from '#lib/HiddenEmail.svelte'
  import MainBlock from '#lib/MainBlock.svelte'
  import clientRecordAnalytics from '#lib/models/client-record-analytics.ts'
  import { onMount } from 'svelte'

  onMount(() => {
    clientRecordAnalytics('technology', fetch)
  })
</script>

<svelte:head>
  <title>Find Sign Technology</title>
</svelte:head>

<Header/>

<MainBlock wide={true}>
  <h1>Spider</h1>
  <p>
    A “Spider” is a computer program. The Spider goes to different websites, explores, finds new things, and
    makes notes. When finished, it’s notes are organised in to files describing everything it has seen.
  </p>
  <h1>Word Embedding</h1>
  <p>
    The next step is “Word Embedding”. A complicated topic! Word embedding creates a map, with coordinates,
    and puts each word on the map in it’s own location. Artificial Intelligence research from written language
    translation websites is used. English words that have a similar meaning, are grouped in to close areas on
    the map. This is important! Similar ideas are in similar areas in the map.
  </p>
  <h1>Search</h1>
  <p>
    When you search for a word, your computer does this:
  </p>
  <ol>
    <li>Download a map of all the signs the spider found, and what kind of meaning they have</li>
    <li>Look at the Word Embedding map, and find the word you searched for, remembering the location</li>
    <li>Check every sign, and see how close it’s meaning is, to the word you entered, by how far away they are
    on the map</li>
    <li>Make a list, organised so the closest signs are at the top</li>
    <li>Download small videos and descriptions, and create the webpage, with results listed down the page</li>
  </ol>
  <h1>Privacy and Tracking</h1>
  <p>
    Find Sign never records what you search for, or who you are. Your usage of Find Sign is not transmitted
    to any privacy invading businesses like Google or Facebook. We do record how often the site is used,
    and you can view this information on our <a href="/analytics">analytics page</a>, but this data never
    records any information about the computers or people accessing the website, just the number of searches
    and other types of queries run. If you’re concerned about privacy, we recommend you never access Find Sign
    using a web browser built in to an app run by a privacy invading company. Always use apps like Safari or
    Firefox, instead of apps like Facebook, Instagram, Tiktok, or Chrome to run private searches. For more information
    about this risk, read the excellent article
    “<a href="https://krausefx.com/blog/ios-privacy-instagram-and-facebook-can-track-anything-you-do-on-any-website-in-their-in-app-browser">
    iOS Privacy: Instagram and Facebook can track anything you do on any website in their in-app browser”
    </a>” by Felix Krause.
  </p>
  <h1>Open Source and Dataset</h1>
  <p>
    Find Sign is open source (mostly with Unlicense software license). You can get the source code at
    <a href="https://github.com/auslan-find-sign/find-sign-website">GitHub</a>.
  </p>
  <p>
    Find Sign indexes copyright data, so the dataset is not open source, but it is intended to be open access for
    non-commercial culturally appropriate use. You can explore the data Find Sign uses on our
    <a href="https://data.auslan.fyi/collections/search-data" data-sveltekit-reload>dataset website</a>.
  </p>
  <p>
    If you want to apply this searching technology to another sign language, you'll need to capture the data for your
    search index, by building some kind of spider program. If you can output the data in the same search-data json format
    this Find Sign instance uses, it'll be easy to setup your own version.
  </p>
  <p>
    If you have quality Auslan vocab or phrase examples, that you would like to see featured in Find Sign, you can
    reach out to us for help getting your data in to Find Sign via
    <HiddenEmail user=find domain=auslan.fyi>email</HiddenEmail>,
    <HiddenEmail user=find domain=auslan.fyi proto="imessage">iMessage</HiddenEmail>,
    or <HiddenEmail user=find domain=auslan.fyi proto="facetime">Facetime</HiddenEmail>.
  </p>
</MainBlock>
