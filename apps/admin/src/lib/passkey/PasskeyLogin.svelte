<script>
  // @ts-nocheck
  import PasskeyButton from './PasskeyButton.svelte'
  import { decode as decodeB64, encodeUrl as encodeB64 } from '@borderless/base64'
  import { createEventDispatcher } from 'svelte'
  const fireEvent = createEventDispatcher()

  export let label = 'Login with Passkey'

  /** optionally specify endpoint url, otherwise defaults to current page url */
  export let endpoint = ''

  async function loginCredential () {
    const startResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ type: 'start-login' })
    })
    const { token, options } = await startResponse.json()
    options.challenge = decodeB64(options.challenge)
    const cred = await navigator.credentials.get({ publicKey: options })
    console.log('cred', cred)

    const credential = {}
    credential.id = cred.id
    credential.type = cred.type
    credential.rawId = encodeB64(cred.rawId)

    if (cred.response) {
      credential.response = {
        clientDataJSON: encodeB64(cred.response.clientDataJSON),
        authenticatorData: encodeB64(cred.response.authenticatorData),
        signature: encodeB64(cred.response.signature),
        userHandle: encodeB64(cred.response.userHandle)
      }
    }

    const completeLoginResponse = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        type: 'complete-login',
        credential,
        token
      })
    })
    const result = await completeLoginResponse.json()
    console.log(result)
    fireEvent('authenticated', result)
  }
</script>
<PasskeyButton on:click={loginCredential} {label}/>