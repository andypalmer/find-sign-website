<script lang=ts>
  import { createEventDispatcher } from 'svelte'
  import { onMount } from 'svelte'

  import {
    browserSupportsWebAuthn, browserSupportsWebAuthnAutofill,
    startAuthentication, startRegistration
  } from '@simplewebauthn/browser'

  import PasskeyButton from './PasskeyButton.svelte'

  export let label = 'Login with Passkey'
  export let username = ''
  export let usernameLabel = 'Username'

  let webauthnAvailable = false

  const fireEvent = createEventDispatcher()

  /** optionally specify endpoint url, otherwise defaults to current page url */
  export let endpoint = ''

  async function fetchEndpoint (obj = {}) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(obj)
    })
    return await response.json()
  }

  async function doAuthFlow (autofill = false) {
    const { action, options } = await fetchEndpoint({ type: 'start', username, autofill })
    if (action === 'login') {
      const attestation = await startAuthentication({ optionsJSON: options, useBrowserAutofill: autofill })
      console.log('attestation', attestation)
      const { verified, session } = await fetchEndpoint({ type: 'login', username, autofill, attestation })
      console.log({ verified, session })
      return verified
    } else if (action === 'register') {
      const attestation = await startRegistration({ optionsJSON: options })
      console.log('attestation', attestation)
      const { verified, session } = await fetchEndpoint({ type: 'register', username, autofill, attestation })
      console.log({ verified, session })
      return verified
    }
    return false
  }

  async function click (event: CustomEvent) {
    event.preventDefault()
    console.log('click')

    const result = await doAuthFlow(false)
    fireEvent('authenticated', result)
    console.log('authentication result', result)
  }

  onMount(async () => {
    webauthnAvailable = browserSupportsWebAuthn()
    if (await browserSupportsWebAuthnAutofill()) {
      try {
        const result = await doAuthFlow(true)
        if (result) {
          console.log('autofill result', result)
          fireEvent('authenticated', result)
        }
      } catch (err) {
        console.info('Autofill failed', err)
      }
    }
  })
</script>

<form>
  <label for="username">{usernameLabel}</label>
  <input type="text" name="username" id="username" bind:value={username} autocomplete="username webauthn">
  <div><PasskeyButton on:click={click} {label} disabled={!webauthnAvailable}/></div>
</form>