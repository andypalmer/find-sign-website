// Import this FIRST in any characterisation test. Several modules read import.meta.env at module
// load time (search.ts, build.ts, data-io.ts), and import.meta.env is backed by process.env in vitest,
// so these values must be in place before those modules are evaluated.
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

Object.assign(process.env, {
  VITE_LOCALE: 'en-AU',
  VITE_VECTOR_INDEX: VectorLibraryBase,
  VITE_SEARCH_DATA: DataBase,
  VITE_SEARCH_INDEX_NAME: 'index',
  VITE_SEARCH_INDEXES: 'alpha,beta',
  VITE_ENCODED_SEARCH_DATAS: EncodedSearchDataBase,
  VITE_VECTOR_FIDELITY: '1.0',
  VITE_VERSION_LABEL: '',
  VITE_NEWS_RSS: NewsRSS,
  VITE_SEARCH_WRITE_IDENTITY: writeIdentity,
  VITE_PASSKEY_CHALLENGE_SECRET: encodeHex(passkeyKeyPair.secretKey),
  VITE_AUTOMATION_KEY: AutomationKey,
})
