import persistentWritable from '#lib/functions/persistent-store.ts'

const usernameStore = persistentWritable('username', '')

export default usernameStore
