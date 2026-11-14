// The service worker. Everything it does is in @find-sign/core's worker-entry.ts (so it can be tested without a
// browser); this only hands it the worker's global. It reads its settings from the address it was registered at.
import { version } from '$app/env'
import { startTheWorker, type WorkerScope } from '@find-sign/core/worker/worker-entry.ts'

startTheWorker(self as unknown as WorkerScope, version)
