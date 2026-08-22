/**
 * Rung 2 — youtubei/v1/next -> getTranscriptEndpoint.params -> get_transcript.
 *
 * arch made this the load-bearing rung because it is what the transcript panel
 * itself calls: invisible, and it sidesteps the PO-token wall without touching
 * the DOM.
 *
 * MEASURED, signed out, 2026-08-22 (be-plan task 1): `next` succeeds and
 * `getTranscriptEndpoint.params` IS present, but `get_transcript` returns 400
 * FAILED_PRECONDITION across three request shapes — bare, with the client
 * headers YouTube itself sends, and with a minimal client-only context.
 *
 * That probe ran SIGNED OUT, and this route uses the page's authenticated
 * session, so it does not settle the signed-in case. The rung is implemented as
 * designed and the ladder falls through when it fails — which is the behaviour
 * that makes the answer safe to not know yet.
 */
import type { Cue } from '../../worker/grounding'
import type { RouteResult } from './types'

interface Ytcfg {
  get?: (k: string) => unknown
}

export function readYtcfg(w: unknown, key: string): unknown {
  const cfg = (w as Record<string, unknown>)?.['ytcfg'] as Ytcfg | undefined
  return cfg?.get?.(key)
}

/** The params live deep in a renderer tree whose shape changes; find them by key. */
export function findTranscriptParams(nextJson: unknown): string | undefined {
  const m = JSON.stringify(nextJson).match(/"getTranscriptEndpoint":\{"params":"([^"]+)"/)
  return m?.[1]
}

export function cuesFromTranscriptResponse(body: unknown): Cue[] {
  const cues: Cue[] = []
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const n of node) walk(n)
      return
    }
    if (typeof node !== 'object' || node === null) return
    const rec = node as Record<string, unknown>
    const seg = rec['transcriptSegmentRenderer'] as Record<string, unknown> | undefined
    if (seg) {
      const snippet = seg['snippet'] as Record<string, unknown> | undefined
      const runs = snippet?.['runs']
      const text = Array.isArray(runs)
        ? runs
            .map((r) => (r as Record<string, unknown>)['text'])
            .filter((t): t is string => typeof t === 'string')
            .join('')
        : ''
      const startMs = Number(seg['startMs'] ?? 0)
      const endMs = Number(seg['endMs'] ?? startMs)
      if (text.trim()) {
        cues.push({ t: startMs / 1000, d: (endMs - startMs) / 1000, text: text.trim() })
      }
    }
    for (const v of Object.values(rec)) walk(v)
  }
  walk(body)
  return cues
}

export async function tryInnertube(w: unknown, videoId: string): Promise<RouteResult> {
  const key = readYtcfg(w, 'INNERTUBE_API_KEY')
  const context = readYtcfg(w, 'INNERTUBE_CONTEXT')
  if (typeof key !== 'string' || !context) {
    return { ok: false, reason: 'empty', detail: 'no innertube config on this page' }
  }

  const post = async (path: string, payload: unknown): Promise<Response | null> => {
    try {
      return await fetch(`/youtubei/v1/${path}?key=${key}&prettyPrint=false`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
    } catch {
      return null
    }
  }

  const nextRes = await post('next', { context, videoId })
  if (!nextRes) return { ok: false, reason: 'empty', detail: 'next did not complete' }
  if (nextRes.status === 429) return { ok: false, reason: 'rate-limited' }
  if (!nextRes.ok) return { ok: false, reason: 'empty', detail: `next ${nextRes.status}` }

  const params = findTranscriptParams(await nextRes.json())
  if (!params) return { ok: false, reason: 'no-captions', detail: 'no transcript endpoint offered' }

  const trRes = await post('get_transcript', { context, params })
  if (!trRes) return { ok: false, reason: 'empty', detail: 'get_transcript did not complete' }
  if (trRes.status === 429) return { ok: false, reason: 'rate-limited' }
  if (trRes.status === 401 || trRes.status === 403) return { ok: false, reason: 'restricted' }
  if (!trRes.ok) {
    // Where FAILED_PRECONDITION lands. Not terminal: the ladder falls to rung 3.
    return { ok: false, reason: 'empty', detail: `get_transcript ${trRes.status}` }
  }

  const cues = cuesFromTranscriptResponse(await trRes.json())
  if (cues.length === 0) return { ok: false, reason: 'empty', detail: 'no segments in response' }
  return { ok: true, route: 'innertube', cues }
}
