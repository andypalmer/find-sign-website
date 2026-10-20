import persistentWritable from '$lib/functions/persistent-store'

const regionStore = persistentWritable<string | false>('region', false)

export default regionStore
