<script lang="ts">
  import { onMount } from 'svelte'
  import { tweened } from 'svelte/motion'
  import { circOut } from 'svelte/easing'
  import timeStore from '#lib/functions/raf-store.ts'

  export let dots = 32
  export let interval = 1.0
  export let active = false

  onMount(() => active = true)

  function round (num: number) { return Math.round(num * 1000) / 1000 }

  $: currentAngle = (($timeStore / interval) * 360.0) % 360.0
  const intensity = tweened(0.0, { easing: circOut })
  $: $intensity = active ? 1.0 : 0.0
  $: dotAngles = (new Array(dots)).fill(0).map((_, i) => ((i / dots) * Math.PI * -2))
</script>

<div class={$$props.class} class:spinner={true} aria-label="Loading indicator" style="--intensity: {round($intensity)}">
  {#each dotAngles as angle}
    <div style="
      --angle: {round(angle / Math.PI * -180)}deg;
      --x: {round(Math.sin(angle))};
      --y: {round(Math.cos(angle))};
      --field: {round(Math.max(0, Math.cos(angle + ((currentAngle / 180.0) * Math.PI))))};">
    </div>
  {/each}
</div>

<style>
  .spinner {
    display: grid;
    min-width: 128px;
    min-height: 128px;
    align-items: center;
    justify-items: center;
    --dots-scale: 1.0;
    --centroid-shift-scale: 0.1;
  }

  .spinner > * {
    --circle-size: 10px;
    grid-row: 1;
    grid-column: 1;
    width: calc(var(--field) * var(--circle-size) * 4 * var(--intensity));
    height: calc(var(--field) * var(--circle-size) * 4 * var(--intensity));
    border: 4px solid currentColor;
    border-radius: 100%;
    --offset: calc(30.5px + (20px * var(--intensity)) + (var(--field) * 1px * var(--intensity)));
    transform:
      translateX(calc(var(--x) * var(--offset)))
      translateY(calc(var(--y) * var(--offset)))
      scale(0.25)
    ;
  }
</style>
