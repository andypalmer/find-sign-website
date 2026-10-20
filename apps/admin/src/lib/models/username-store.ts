import persistentWritable from '@find-sign/core/functions/persistent-store.ts'

const usernameStore = persistentWritable('username', '')

export default usernameStore
