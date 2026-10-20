import persistentWritable from '$lib/functions/persistent-store'

const usernameStore = persistentWritable('username', '')

export default usernameStore
