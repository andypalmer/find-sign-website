// Import this FIRST in any characterisation test. Several modules read settings at module load time
// (search.ts, build.ts, data-io.ts). In tests, $app/env/public and $app/env/private read process.env
// (vitest-aliases.js), so these values must be in place before those modules are evaluated.
import { sign_keyPair_fromSeed, encodeHex } from 'tweetnacl-ts'

export const DataBase = 'http://data.test/collections/find-sign/raw/'
export const EncodedSearchDataBase = 'http://data.test/collections/encoded-search-data/raw'
export const VectorLibraryBase = 'http://data.test/collections/wordvec/raw/test-vectors'
export const NewsRSS = 'http://news.test/rss'
export const AutomationKey = 'test-automation-key'

// deterministic data-server write identity, so license strings can be verified in tests
export const writeKeyPair = sign_keyPair_fromSeed(new Uint8Array(32).fill(7))
export const writeIdentity = `${encodeHex(writeKeyPair.publicKey)}-${encodeHex(writeKeyPair.secretKey)}`

// deterministic passkey session signing key
export const passkeyKeyPair = sign_keyPair_fromSeed(new Uint8Array(32).fill(9))

// stands in for discord's interaction signing key
export const discordKeyPair = sign_keyPair_fromSeed(new Uint8Array(32).fill(11))

Object.assign(process.env, {
  LOCALE: 'en-AU',
  VECTOR_INDEX: VectorLibraryBase,
  SEARCH_DATA: DataBase,
  SEARCH_INDEX_NAME: 'index',
  SEARCH_INDEXES: 'alpha,beta',
  ENCODED_SEARCH_DATAS: EncodedSearchDataBase,
  VECTOR_FIDELITY: '1.0',
  VERSION_LABEL: '',
  NEWS_RSS: NewsRSS,
  SEARCH_WRITE_IDENTITY: writeIdentity,
  PASSKEY_CHALLENGE_SECRET: encodeHex(passkeyKeyPair.secretKey),
  AUTOMATION_KEY: AutomationKey,
  DISCORD_PUBLIC_KEY: encodeHex(discordKeyPair.publicKey),
})
