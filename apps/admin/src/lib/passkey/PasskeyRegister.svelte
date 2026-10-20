<script>
  // @ts-nocheck
  import PasskeyButton from './PasskeyButton.svelte'
  import { decode as decodeB64, encodeUrl as encodeB64 } from '@borderless/base64'
  import { createEventDispatcher } from 'svelte'
  const fireEvent = createEventDispatcher()

  export let label = 'Register with Passkey'

  /** optionally specify endpoint url, otherwise defaults to current page url */
  export let endpoint = ''

  async function registerCredential () {
    const startResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        type: 'start-registration',
        opts: {
          attestation: 'none', // Preference for attestation conveyance—none, indirect, or direct. Choose none unless you need one.
          authenticatorSelection: {
            authenticatorAttachment: 'platform', // Filter available authenticators. If you want an authenticator attached to the device, use "platform". For roaming authenticators, use "cross-platform".
            userVerification: 'required', // Determine whether authenticator local user verification is "required", "preferred", or "discouraged". If you want fingerprint or screen-lock authentication, use "required".
            requireResidentKey: true // Use true if the created credential should be available for future account picker UX.
          }
        }
      })
    })
    const publicKeyOptions = await startResponse.json()

    publicKeyOptions.user.id = decodeB64(publicKeyOptions.user.id)
    publicKeyOptions.challenge = decodeB64(publicKeyOptions.challenge)

    if (publicKeyOptions.excludeCredentials) {
      for (let cred of publicKeyOptions.excludeCredentials) {
        cred.id = decodeB64(cred.id)
      }
    }

    const cred = await navigator.credentials.create({ publicKey: publicKeyOptions })
    console.log('cred', cred)

    const credential = {}
    credential.id = cred.id
    credential.rawId = encodeB64(cred.rawId)
    credential.type = cred.type

    if (cred.response) {
      const clientDataJSON = encodeB64(cred.response.clientDataJSON)
      const attestationObject = encodeB64(cred.response.attestationObject)
      credential.response = { clientDataJSON, attestationObject }
    }

    const storeResponse = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        type: 'store-registration',
        credential,
        challenge: encodeB64(publicKeyOptions.challenge)
      })
    })
    const result = await storeResponse.json()
    console.log(result)
    fireEvent('authenticated', result)
  }
</script>
<PasskeyButton on:click={registerCredential} {label}/>