// The same address, but on another origin (scheme, host and port). The path and query stay as they are, so the
// server can fetch from an address inside its own network while the keys and addresses keep the public one.
export function swapOrigin (url: string, origin: string): string {
  const address = new URL(url)
  const replacement = new URL(origin)
  return `${replacement.origin}${address.pathname}${address.search}`
}
