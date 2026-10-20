<script lang=ts>
  import { createEventDispatcher } from 'svelte'
  import FingerprintIcon from './FingerprintIcon.svelte'

  export let label: string = 'Sign in with Passkey'
  export let disabled: boolean = false

  const eventDispatch = createEventDispatcher()

  function onClick (event: MouseEvent) {
    event.preventDefault()
    if (!disabled) {
      eventDispatch('click', event)
    }
  }
</script>
<button on:click={onClick} style={$$props.style} class={$$props.class} {disabled}><FingerprintIcon/> {label}</button>
<style>
  button {
    all: unset;
    border-radius: 3px;
    background-color: rgb(19, 59, 88);
    color: white;
    font-size: 1.0em;
    min-height: 30px;
    min-width: 140px;
    padding-left: 30px;
    padding-right: 30px;
    padding-top: 5px;
    padding-bottom: 5px;
    display: inline-block;
    width: 13rem;
    cursor: pointer;
  }
</style>