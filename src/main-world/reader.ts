/**
 * C1 — the MAIN-world transcript reader.
 *
 * Lives in the page's world for SESSION ACCESS, not for DOM work: rungs 1 and 2
 * need the page's authenticated session, and only rung 3 touches the DOM. It has
 * no `chrome.*`, so it bridges to the isolated world by postMessage.
 *
 * THE CREDENTIAL NEVER CROSSES THAT BOUNDARY, in either direction. C1 has no
 * reason to know one exists, and hld T3 relies on that being structural rather
 * than a rule someone remembers.
 */
import { tryBaseUrl } from './routes/baseurl'
import { tryInnertube } from './routes/innertube'
import { tryDom } from './routes/dom'
import { isTerminal, type FailureReason, type RouteResult } from './routes/types'
import type { Cue } from '../worker/grounding'

export type { Route, FailureReason } from './routes/types'

/**
 * Acquisition is DECOUPLED FROM CAPTURE.
 *
 * The transcript covers the whole video, so it is fetched once per video and
 * every later capture in that video is local memory. Where rung 3 runs, that is
 * the difference between one panel perturbation per VIDEO and one per CLIP.
 */
const cache = new Map<string, RouteResult>()

export function clearCache(): void {
  cache.clear()
}

interface Ladder {
  baseurl: () => Promise<RouteResult>
  innertube: () => Promise<RouteResult>
  dom: () => Promise<RouteResult>
}

/**
 * Try the rungs in order, and STOP on a terminal reason.
 *
 * `rate-limited` and `restricted` are terminal. Falling through on a 429 burns
 * all three rungs against a server already asking us to slow down, and a
 * restricted video will be restricted on every rung — so trying the next one
 * both wastes the attempt and risks telling the user something false about why
 * it failed.
 *
 * `no-captions` and `empty` are NOT terminal: they are exactly the case the
 * ladder exists for.
 */
export async function runLadder(ladder: Ladder): Promise<RouteResult> {
  const attempts: Array<keyof Ladder> = ['baseurl', 'innertube', 'dom']
  let last: RouteResult = { ok: false, reason: 'no-captions' }

  for (const name of attempts) {
    const r = await ladder[name]()
    if (r.ok) return r
    last = r
    if (isTerminal(r.reason)) return r
  }
  return last
}

export async function acquire(videoId: string, w: unknown = window): Promise<RouteResult> {
  const hit = cache.get(videoId)
  if (hit) return hit

  const playerResponse = (w as Record<string, unknown>)['ytInitialPlayerResponse']
  const result = await runLadder({
    baseurl: () => tryBaseUrl(playerResponse),
    innertube: () => tryInnertube(w, videoId),
    dom: () => tryDom(),
  })

  // Cache successes and terminal failures alike: retrying a rate-limited or
  // restricted video on the next clip would repeat the same wasted work.
  if (result.ok || isTerminal(result.reason)) cache.set(videoId, result)
  return result
}

export function cuesInRange(cues: readonly Cue[], start: number, end: number): Cue[] {
  return cues.filter((c) => c.t + c.d >= start && c.t <= end)
}

export type { RouteResult }
export type { FailureReason as ReaderFailureReason }

/**
 * Listen for K1 requests from C2 and answer them.
 *
 * This is the whole of C1's public surface. It never sends anything C2 did not
 * ask for, and it echoes the nonce verbatim so C2 can tell our reply from one
 * YouTube's own scripts posted.
 */
export function listenForAcquireRequests(w: Window = window): void {
  w.addEventListener('message', (e: MessageEvent) => {
    if (e.source !== w) return
    const m = e.data as Record<string, unknown> | null
    if (!m || m['v'] !== 1 || m['kind'] !== 'acquire') return
    const nonce = m['nonce']
    const videoId = m['videoId']
    if (typeof nonce !== 'string' || !nonce || typeof videoId !== 'string') return

    void acquire(videoId, w).then((r) => {
      w.postMessage(
        r.ok
          ? { v: 1, nonce, kind: 'transcript', ok: true, route: r.route, videoId, cues: r.cues }
          : { v: 1, nonce, kind: 'transcript', ok: false, videoId, reason: r.reason, detail: r.detail },
        w.location.origin,
      )
    })
  })
}

// NOTE: no side effect at import. The listener is started by entry.ts, which is
// what the manifest loads. Keeping this module import-pure is what lets the
// ladder be unit-tested in a plain node environment.
