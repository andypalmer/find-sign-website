import persistentWritable from '@find-sign/core/functions/persistent-store.ts'

const regionStore = persistentWritable<string | false>('region', false)

export default regionStore
