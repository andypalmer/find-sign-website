// Admin corrections to encoded-search-data entries, in the website's data server collection (see
// @andypalmer/indexer's overrides). Index builds apply them.
import { overridesIn } from '@andypalmer/indexer'
import { dataStore } from '@find-sign/data-io/data-io.ts'

export type { IndexOverride } from '@andypalmer/indexer'

const overrides = overridesIn(dataStore)

export const listOverrides = overrides.list
export const getOverrideFor = overrides.get
export const setOverrideFor = overrides.set
export const deleteOverrideFor = overrides.delete
