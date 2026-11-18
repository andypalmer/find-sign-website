// this app's settings, read from the environment when the server starts (see @find-sign/core/env-vars.ts)
import { defineEnvVars } from '@sveltejs/kit/env'
import { coreEnvVars, required, optional, forbidden } from '@find-sign/core/env-vars.ts'

export const variables = defineEnvVars({
  ...coreEnvVars,
  NEWS_RSS: { schema: required, description: 'rss feed shown on the home and news pages' },
  ADMIN_URL: { public: true, schema: optional, description: 'where searching for "admin" offers a link to; unset for no hint' },

  // the server fetches index files from this origin (scheme, host and port) when it is set, such as http://data:8080,
  // so the requests stay inside the docker host. Browsers always use SEARCH_DATA. Unset: the server uses SEARCH_DATA too
  DATA_SERVER_INTERNAL: { schema: optional, description: 'origin the server fetches index files from, e.g. http://data:8080' },

  DISCORD_PUBLIC_KEY: { schema: optional, description: 'discord bot interaction signing key' },
  DISCORD_APPLICATION_ID: { schema: optional, description: 'discord bot application id' },
  DISCORD_BOT_TOKEN: { schema: optional, description: 'discord bot token, used by /discord/setup' },
  AUTOMATION_KEY: { schema: optional, description: 'key query parameter that authorises /discord/setup' },

  // the public site never holds the data server write identity, so it can't write
  SEARCH_WRITE_IDENTITY: { schema: forbidden, description: 'only the admin app may have this' },
  PASSKEY_CHALLENGE_SECRET: { schema: forbidden, description: 'only the admin app may have this' },
})
