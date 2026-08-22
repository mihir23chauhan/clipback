/**
 * C1's entry point — the file the manifest actually loads.
 *
 * Everything with a side effect lives here, and reader.ts stays import-pure so
 * the ladder can be unit-tested without a DOM.
 */
import { listenForAcquireRequests } from './reader'

listenForAcquireRequests()
console.log(JSON.stringify({ at: 'main-world', event: 'ready' }))
