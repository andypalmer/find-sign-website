// stands in for sveltekit's $app/env/private in tests (see vitest-aliases.js): values come from process.env,
// which test-env.ts fills before any module reading them loads
const { env } = process
export const ENCODED_SEARCH_DATAS = env.ENCODED_SEARCH_DATAS as string
export const LOCALE = env.LOCALE || undefined
export const VECTOR_FIDELITY = env.VECTOR_FIDELITY || undefined
export const NEWS_RSS = env.NEWS_RSS as string
export const SEARCH_WRITE_IDENTITY = env.SEARCH_WRITE_IDENTITY || undefined
export const PASSKEY_CHALLENGE_SECRET = env.PASSKEY_CHALLENGE_SECRET || undefined
export const PASSKEY_RP_ID = env.PASSKEY_RP_ID || undefined
export const AUTOMATION_KEY = env.AUTOMATION_KEY || undefined
export const DISCORD_PUBLIC_KEY = env.DISCORD_PUBLIC_KEY || undefined
export const DISCORD_APPLICATION_ID = env.DISCORD_APPLICATION_ID || undefined
export const DISCORD_BOT_TOKEN = env.DISCORD_BOT_TOKEN || undefined
