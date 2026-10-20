<script lang="ts">
  export let animating = true
  export let speed = '1s'
</script>

<svg aria-label="loading indicator" viewBox="0 0 32 32" style="--speed: {speed}" class:animating>
  <circle opacity=0.25 cx=16 cy=16 r=13 stroke-width=5 />
	<path stroke-width=5 stroke-linecap=round d="
		M 13 4
		A 13 13 0 0 1 29 16
	"/>
</svg>

<style>
  svg {
    stroke: currentColor;
		fill: none;
    width: 1em;
    height: 1em;
  }

	svg path {
		opacity: 0;
		transition: opacity 0.5s;
    animation-play-state: paused;
    transform-origin: 50% 50%;
    transform: rotate(0deg);
    animation-name: spin;
		animation-duration: var(--speed);
		animation-iteration-count: infinite;
		animation-timing-function: linear;
	}

  svg.animating path {
		opacity: 1;
    animation-play-state: running;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
