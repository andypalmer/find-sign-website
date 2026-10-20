import { readable } from 'svelte/store'
import { browser } from '$app/environment'

// store with whole seconds webpage has been open for, according to the UI scheduler (requestAnimationFrame)
// for driving continuous animations
export default readable(0, (set) => {
  if (browser) {
    let cancel = false
    const update = (time) => {
      if (cancel) return
      set(time / 1000)
      requestAnimationFrame(update)
    }
    requestAnimationFrame(update)
    return () => cancel = true
  } else {
    set(0)
    return () => {}
  }
})
