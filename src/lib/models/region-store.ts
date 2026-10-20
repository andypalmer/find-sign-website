import persistentWritable from '#lib/functions/persistent-store.ts'

const regionStore = persistentWritable<string | false>('region', false)

export default regionStore
