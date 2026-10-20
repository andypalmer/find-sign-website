<script lang="ts">
  import type { PageData } from "./$types"
  import MainBlock from "$lib/MainBlock.svelte"
  import { LayerCake, Svg } from "layercake"
  import { times } from "$lib/functions/iters"
	import AxisX from "$lib/charts/AxisX.svelte"
	import AxisY from "$lib/charts/AxisY.svelte"
	import Line from "$lib/charts/Line.svelte"
	import Area from "$lib/charts/Area.svelte"
	import Header from "$lib/header/Header.svelte"
	import watchMedia from '$lib/functions/media-store'
	import { invalidate } from "$app/navigation"
	import { page } from "$app/stores"
	import { browser } from "$app/environment"

  export let data: PageData // server sent data is all in UTC zone

	let tzOffsetHrs = (new Date()).getTimezoneOffset() / -60

	const media = watchMedia({ phone: '(max-width: 600px)' })

	const TzRotateMinutes = 60
	const TzRotateHours = 1
	// rotate an array of data to account for local client timezone
	function tzRotate (data: number[], offsetHrs: number, multiplier: number): number[] {
		const arrayOffset = Math.round(offsetHrs * multiplier)
		if (tzOffsetHrs > 0) {
			return [...data.slice(-arrayOffset), ...data.slice(0, data.length - arrayOffset)]
		} else if (tzOffsetHrs < 0) {
			return [...data.slice(-arrayOffset), ...data.slice(0, -arrayOffset)]
		} else {
			return [...data]
		}
	}

	$: yearStartMs = Date.UTC(data.year, 0)
	$: yearMonthTicks = [...times(12, month => {
		const monthStartMs = Date.UTC(data.year, month)
		return (monthStartMs - yearStartMs) / (24 * 60 * 60 * 1000)
	})]

	const yearMonthFormat = (dayOfYear) => {
		const tickDate = new Date(yearStartMs + (dayOfYear * 24 * 60 * 60 * 1000))
		const utcMonth = tickDate.getUTCMonth()
		return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][utcMonth]
	}


  $: points = data.days.map((y, x) => ({ x, y }))
	$: total = data.days.reduce((x, y) => x + y, 0)

	$: avgDayPoints = tzRotate(data.avgDay, tzOffsetHrs, TzRotateMinutes / 5).map((y, x) => ({ x: x / (60 / 5), y }))

	$: avgWeekPoints = tzRotate(data.avgWeek, tzOffsetHrs, TzRotateHours).map((y, x) => ({ x: x / 24, y }))

	// polling for updates mechanism, only if year is current
	let refreshTimer
	$: if (browser && data && data.maxAge && data.year === (new Date()).getUTCFullYear()) {
		if (refreshTimer) clearTimeout(refreshTimer)
		refreshTimer = setTimeout(() =>
			invalidate($page.url.pathname)
		, data.maxAge)
	}

	// $: console.log(avgWeekPoints)
</script>

<svelte:head>
	<title>“{data.topic}” Analytics</title>
</svelte:head>

<Header />

<MainBlock wide>
  <h1>“{data.topic}” requests in {data.year}</h1>

	<p><a href="/analytics" data-sveltekit-noscroll data-sveltekit-preload-data>Back to Analytics Topics List</a></p>

	<div class="year-links">
		<a href="?year={data.year - 1}" data-sveltekit-noscroll data-sveltekit-preload-data>⋖ {data.year - 1}</a>
		<span>{data.year}</span>
		<a href="?year={data.year + 1}" data-sveltekit-noscroll data-sveltekit-preload-data>{data.year + 1} ⋗</a>
	</div>

	<p>Display Timezone: <input type="range" min="-12" max="12" step="0.5" bind:value={tzOffsetHrs}> UTC {tzOffsetHrs < 0 ? '-' : '+'} {Math.abs(tzOffsetHrs)} hours </p>

	<div class="chart">
		<LayerCake padding={{ right: 10, bottom: 20, left: 50 }} x='x' y='y' data={points}>
			<Svg>
				<AxisX ticks={yearMonthTicks} formatTick={yearMonthFormat} />
				<AxisY ticks={8} formatTick={t => `${t} p/d`} textAnchor="end" dxTick={40} />
				<Area/>
				<Line stroke='currentColor'/>
			</Svg>
		</LayerCake>
	</div>

	<h1>Average Day in {data.year}</h1>

	<div class="chart">
		<LayerCake padding={{ right: 10, bottom: 20, left: 50 }} x='x' y='y' data={avgDayPoints}>
			<Svg>
				<AxisX ticks={24} formatTick={t =>
					(!browser || !$media.phone)
					?	[
							'12am', '1am', '2am', '3am', '4am', '5am', '6am', '7am', '8am', '9am', '10am', '11am',
							'12pm', '1pm', '2pm', '3pm', '4pm', '5pm', '6pm', '7pm', '8pm', '9pm', '10pm', '11pm'
						][t]
					: [
							'12am', '', '', '3am', '', '', '6am', '', '', '9am', '', '',
							'12pm', '', '', '3pm', '', '', '6pm', '', '', '9pm', '', ''
						][t]
				}/>
				<AxisY ticks={8} formatTick={t => `${Math.round(t * 12 * 10) / 10} p/h`} textAnchor="end" dxTick={40} />
				<Area/>
				<Line stroke='currentColor'/>
			</Svg>
		</LayerCake>
	</div>

	<h1>Average Week in {data.year}</h1>

	<div class="chart">
		<LayerCake padding={{ right: 10, bottom: 20, left: 50 }} x='x' y='y' data={avgWeekPoints}>
			<Svg>
				<AxisX ticks={7} formatTick={t => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][t]} />
				<AxisY ticks={8} formatTick={t => `${t} p/h` } textAnchor="end" dxTick={40} />
				<Area/>
				<Line stroke='currentColor'/>
			</Svg>
		</LayerCake>
	</div>

	<p>Total hits in {data.year}: {total}, a daily average of {total / data.days.length} each day</p>

	<p>p/d refers to hits per day, p/h refers to hits per hour.</p>

	{#if data.year < 2022}
		<p>
			Note: Prior to 2022, data was collected using Fathom Analytics, which only records hits per hour. That's why the Average Day graph looks weirdly regular.
		</p>
	{:else if data.topic !== 'search' && data.year === 2022}
		<p>
			Note: Up to 22nd of July 2022, data was collected using Fathom Analytics, which only records hits per hour. This is why Average Day graph has unusual spikes
			at the start of each hour in this year. Data was not collected again until August 24th this year, as no analytics solution was implemented until then, after
			the SvelteKit site rewrite, due to privacy concerns. After this point, data is collected with minute by minute accuracy.
		</p>
	{/if}

	{#if data.topic === 'search' && data.year <= 2022}
		<p>
			Note: Due to a quirk in how Find Sign used to work, individual search hits were not able to be recorded before August 24th 2022. Usage before this point can be
			somewhat inferred by hits in the <a href="/analytics/homepage" data-sveltekit-preload-data>homepage</a> dataset.
		</p>
	{/if}
</MainBlock>

<style>
	.chart {
		height: 300px;
		width: auto;
	}

	.year-links {
		display: flex;
		justify-content: space-between;
		margin: 2em 0;
	}
</style>