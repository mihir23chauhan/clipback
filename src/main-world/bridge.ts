/**
 * K1 — C1 to C2, over window.postMessage.
 *
 * This channel is PUBLIC and FORGEABLE. YouTube's own scripts can read what we
 * post and can post into it, so the contract carries a nonce: C2 issues it, C1
 * echoes it back VERBATIM, and C2 rejects any reply whose nonce it did not
 * issue. Without that, a forged transcript is indistinguishable from a real one.
 *
 * hld T2 states the residual honestly: a nonce sent in the clear over a channel
 * the page can READ stops unsolicited injection and replay, not a
 * reader-adversary who learns the nonce and answers first. fe-plan takes the
 * real fix — a MessageChannel port transferred to C1 at injection time — and
 * this module supports both, because C2 is what injects C1 and so C2 chooses.
 *
 * THE CREDENTIAL NEVER CROSSES THIS BOUNDARY. There is no field for it.
 */
import type { Cue } from '../worker/grounding'
import type { FailureReason, Route } from './routes/types'

export const K1_VERSION = 1
export const K1_KIND = 'transcript' as const

export interface K1Request {
  v: typeof K1_VERSION
  nonce: string
  kind: 'acquire'
  videoId: string
}

export interface K1Success {
  v: typeof K1_VERSION
  nonce: string
  kind: typeof K1_KIND
  ok: true
  route: Route
  videoId: string
  cues: Cue[]
}

export interface K1Failure {
  v: typeof K1_VERSION
  nonce: string
  kind: typeof K1_KIND
  ok: false
  videoId: string
  reason: FailureReason
  detail?: string
}

export type K1Reply = K1Success | K1Failure

export function isK1Request(m: unknown): m is K1Request {
  if (typeof m !== 'object' || m === null) return false
  const r = m as Record<string, unknown>
  return (
    r['v'] === K1_VERSION &&
    r['kind'] === 'acquire' &&
    typeof r['nonce'] === 'string' &&
    r['nonce'].length > 0 &&
    typeof r['videoId'] === 'string'
  )
}

/**
 * Validate a reply against the nonce WE issued.
 *
 * Called by C2. Anything that fails here is treated as F2 — an F1-class
 * acquisition failure — rather than as data.
 */
export function isK1ReplyFor(m: unknown, expectedNonce: string, videoId: string): m is K1Reply {
  if (typeof m !== 'object' || m === null) return false
  const r = m as Record<string, unknown>
  if (r['v'] !== K1_VERSION || r['kind'] !== K1_KIND) return false
  // Constant work regardless of where the mismatch is; there is nothing secret
  // in a nonce that is posted in the clear, but the shape check must not
  // short-circuit into "any object with ok:true is a transcript".
  if (typeof r['nonce'] !== 'string' || r['nonce'] !== expectedNonce) return false
  if (r['videoId'] !== videoId) return false
  if (r['ok'] === true) return Array.isArray(r['cues']) && typeof r['route'] === 'string'
  if (r['ok'] === false) return typeof r['reason'] === 'string'
  return false
}

export function newNonce(): string {
  return crypto.randomUUID()
}

/** C1's side: reply on the same channel the request arrived on. */
export function replyTo(req: K1Request, result: Omit<K1Reply, 'v' | 'nonce' | 'kind' | 'videoId'>): K1Reply {
  return {
    v: K1_VERSION,
    nonce: req.nonce,
    kind: K1_KIND,
    videoId: req.videoId,
    ...result,
  } as K1Reply
}
