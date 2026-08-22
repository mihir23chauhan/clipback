/**
 * C3 — the service worker.
 *
 * Skeleton only: repo-genesis stands the chain up, be-build implements it.
 * Two message kinds and no more, per hld K2 (compose) and K6 (deliver).
 *
 * This context holds NOTHING across a wake. MV3 kills it when idle, so every
 * handler re-reads its config and its credential rather than caching them.
 */

type ClipbackMessage = { v: 1; kind: 'compose' | 'deliver' }

chrome.runtime.onMessage.addListener((msg: ClipbackMessage, _sender, sendResponse) => {
  switch (msg?.kind) {
    case 'compose':
      sendResponse({ v: 1, ok: false, reason: 'not-implemented' })
      return false
    case 'deliver':
      sendResponse({ v: 1, delivered: [], failed: [{ target: 'markdown', reason: 'not-implemented' }] })
      return false
    default:
      return false
  }
})

console.log('[clipback] worker awake')
