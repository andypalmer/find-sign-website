// What the error page says when something we didn't expect goes wrong. SvelteKit's own wording is "Internal Error",
// which hides the cause: fine for visitors, but it leaves nothing to read on a phone when we are testing. So on a site
// with a version label (a beta), the page says what the error was. The real site has none, and keeps the plain wording.

const longest = 300

/** what an error was, in a line a person can read on a phone */
export function describeError (error: unknown): string {
  let text: string
  try {
    text = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  } catch {
    text = 'an error that could not be described'
  }
  return text.length > longest ? `${text.slice(0, longest)}…` : text
}

/** what the error page should say about an error nobody expected, or nothing to keep the plain "Internal Error" */
export function errorForTheErrorPage (error: unknown, label: string | undefined): { message: string } | undefined {
  return label ? { message: describeError(error) } : undefined
}
