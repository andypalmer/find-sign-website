// this app's settings, read from the environment when the server starts (see @find-sign/core/env-vars.ts)
import { defineEnvVars } from '@sveltejs/kit/env'
import { coreEnvVars, indexerEnvVars, required, optional } from '@find-sign/core/env-vars.ts'

export const variables = defineEnvVars({
  ...coreEnvVars,
  ...indexerEnvVars,
  SEARCH_WRITE_IDENTITY: { schema: required, description: 'find-sign-data identity ("publickey-secretkey" hex) that can write to SEARCH_DATA' },
  PASSKEY_CHALLENGE_SECRET: { schema: optional, description: 'hex tweetnacl sign secret key for login challenges and sessions; set it when running more than one server' },
  PASSKEY_RP_ID: { schema: optional, description: 'passkey relying party id; unset uses the request hostname' },
  AUTOMATION_KEY: { schema: optional, description: 'key query parameter that authorises /automation/build-index' },
})
