const months = [
  'January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'
]
const numSuffixes = ['th', 'st', 'nd', 'rd', 'th']
const weekdays = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday',
  'Friday', 'Saturday'
]

/**
 * Format a epoch in milliseconds or a date in to a nice humane format: "Thursday, 23rd December 2021"
 */
export function humane (timestamp: number | Date) : string {
  const date = new Date(timestamp)
  const dayOfWeek = weekdays[date.getDay()]
  const day = date.getDate()
  const suffix = numSuffixes[Math.min(day % 10, 4)]
  const month = months[date.getMonth()]
  const year = date.getFullYear()
  return `${dayOfWeek}, ${day}${suffix} ${month} ${year}`
}

/**
 * Format a epoch in milliseconds or a date in to an iso timestamp string
 */
export function iso (timestamp: number | Date) : string {
  return (new Date(timestamp)).toISOString()
}
