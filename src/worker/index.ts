/**
 * C3 — the service worker.
 *
 * The router, and nothing else. It holds NO state: MV3 kills this context when
 * idle, so every handler re-reads its config and its credential. A module-level
 * cache here is a bug that only shows up after 30 idle seconds.
 *
 * Two message kinds, per hld: `compose` (K2) and `deliver` (K6). They are
 * separate because a delivery failure must never discard a composed note.
 */
import { compose, type ComposeRequest } from './compose'
import { deliver, type DeliverRequest } from './deliver'

interface Envelope {
  v: 1
  kind: 'compose' | 'deliver'
  payload: unknown
}

function isEnvelope(m: unknown): m is Envelope {
  if (typeof m !== 'object' || m === null) return false
  const r = m as Record<string, unknown>
  return r['v'] === 1 && (r['kind'] === 'compose' || r['kind'] === 'deliver')
}

chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
  if (!isEnvelope(msg)) return false

  if (msg.kind === 'compose') {
    void compose(msg.payload as ComposeRequest).then(
      (r) => sendResponse({ v: 1, ...r }),
      (e: unknown) => sendResponse({ v: 1, ok: false, reason: 'network', detail: String(e) }),
    )
    return true // keep the channel open for the async reply
  }

  void deliver(msg.payload as DeliverRequest).then(
    (r) => sendResponse({ v: 1, ...r }),
    (e: unknown) =>
      sendResponse({ v: 1, delivered: [], failed: [{ target: 'markdown', reason: String(e) }] }),
  )
  return true
})

// Structured, and it carries no key and no note body — hld "Observability".
console.log(JSON.stringify({ at: 'worker', event: 'awake' }))
