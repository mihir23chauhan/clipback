/**
 * Rung 1 — captionTracks baseUrl + fmt=json3, same origin, invisible.
 *
 * Fails when the track carries `&exp=xpe` without a `pot=` — YouTube's PO-token
 * gate. That is MEASURED, not hypothetical: on the spec spike's own video this
 * returns HTTP 200 with a ZERO-BYTE body, which is why a status check alone is
 * not enough to tell success from the wall.
 */
import type { Cue } from '../../worker/grounding'
import type { RouteResult } from './types'

interface CaptionTrack {
  baseUrl: string
  languageCode?: string
  kind?: string
}

export function captionTracksFrom(playerResponse: unknown): CaptionTrack[] {
  const pr = playerResponse as Record<string, unknown> | undefined
  const captions = pr?.['captions'] as Record<string, unknown> | undefined
  const list = captions?.['playerCaptionsTracklistRenderer'] as Record<string, unknown> | undefined
  const tracks = list?.['captionTracks']
  return Array.isArray(tracks) ? (tracks as CaptionTrack[]) : []
}

/** A track gated behind a PO token we do not have. */
export function isPoTokenGated(baseUrl: string): boolean {
  return baseUrl.includes('exp=xpe') && !baseUrl.includes('pot=')
}

export function cuesFromJson3(body: unknown): Cue[] {
  const events = (body as Record<string, unknown>)?.['events']
  if (!Array.isArray(events)) return []
  const cues: Cue[] = []
  for (const e of events as Record<string, unknown>[]) {
    const segs = e['segs']
    if (!Array.isArray(segs)) continue
    const text = segs
      .map((s) => (s as Record<string, unknown>)['utf8'])
      .filter((t): t is string => typeof t === 'string')
      .join('')
      .replace(/\n/g, ' ')
      .trim()
    if (!text) continue
    cues.push({
      t: Number(e['tStartMs'] ?? 0) / 1000,
      d: Number(e['dDurationMs'] ?? 0) / 1000,
      text,
    })
  }
  return cues
}

export async function tryBaseUrl(playerResponse: unknown): Promise<RouteResult> {
  const tracks = captionTracksFrom(playerResponse)
  if (tracks.length === 0) return { ok: false, reason: 'no-captions' }

  const track = tracks.find((t) => t.languageCode?.startsWith('en')) ?? tracks[0]
  if (!track) return { ok: false, reason: 'no-captions' }

  if (isPoTokenGated(track.baseUrl)) {
    // Measured: this returns 200 with an empty body. Reporting it as `empty`
    // rather than failing hard is what lets the ladder advance to rung 2.
    return { ok: false, reason: 'empty', detail: 'track is PO-token gated (exp=xpe, no pot)' }
  }

  let res: Response
  try {
    res = await fetch(`${track.baseUrl}&fmt=json3`, { credentials: 'include' })
  } catch (e) {
    return { ok: false, reason: 'empty', detail: String(e) }
  }

  if (res.status === 429) return { ok: false, reason: 'rate-limited' }
  if (res.status === 401 || res.status === 403) return { ok: false, reason: 'restricted' }
  if (!res.ok) return { ok: false, reason: 'empty', detail: `status ${res.status}` }

  const text = await res.text()
  // 200 with nothing in it IS the gate. A status check alone misses this.
  if (text.length === 0) return { ok: false, reason: 'empty', detail: '200 with a zero-byte body' }

  let cues: Cue[]
  try {
    cues = cuesFromJson3(JSON.parse(text))
  } catch {
    return { ok: false, reason: 'empty', detail: 'json3 body did not parse' }
  }
  if (cues.length === 0) return { ok: false, reason: 'empty', detail: 'no cues in json3 body' }
  return { ok: true, route: 'baseurl', cues }
}
