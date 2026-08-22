/**
 * Rung 3 — open the transcript panel and read it.
 *
 * Last, and the ordering is a correction of an earlier decision that had it
 * first. Two reasons: the panel's `target-id` changed twice in eight weeks
 * during 2026, and this is the ONLY VISIBLE rung. Transcript segments exist in
 * the DOM only while the panel is rendered, so open-then-hide is not available —
 * the user sees the panel open.
 *
 * A route that "uses what the user can see" feels robust and is not.
 *
 * Because it perturbs the page, acquisition is cached per video (see reader.ts):
 * the cost is one panel open per video, never one per clip.
 */
import type { Cue } from '../../worker/grounding'
import type { RouteResult } from './types'

const SEGMENT = 'ytd-transcript-segment-renderer'

/** Selectors change. Keep them in ONE place so a break is one edit, not a hunt. */
export const SELECTORS = {
  segment: SEGMENT,
  timestamp: `${SEGMENT} .segment-timestamp`,
  text: `${SEGMENT} .segment-text`,
  expandDescription: '#expand, tp-yt-paper-button#expand',
} as const

/** "12:34" or "1:02:03" -> seconds. */
export function parseTimestamp(s: string): number {
  const parts = s
    .trim()
    .split(':')
    .map((p) => Number(p))
  if (parts.some((n) => !Number.isFinite(n))) return 0
  return parts.reduce((acc, n) => acc * 60 + n, 0)
}

export function cuesFromSegments(nodes: readonly Element[]): Cue[] {
  const cues: Cue[] = []
  for (const el of nodes) {
    const ts = el.querySelector('.segment-timestamp')?.textContent ?? ''
    const text = (el.querySelector('.segment-text')?.textContent ?? '').trim()
    if (!text) continue
    cues.push({ t: parseTimestamp(ts), d: 0, text })
  }
  // The panel gives no durations; derive each from the next start so the joined
  // text and the timings stay consistent with the other two rungs.
  for (let i = 0; i < cues.length - 1; i += 1) {
    const here = cues[i]
    const next = cues[i + 1]
    if (here && next) here.d = Math.max(0, next.t - here.t)
  }
  return cues
}

async function waitFor<T>(get: () => T | null, ms: number): Promise<T | null> {
  const deadline = Date.now() + ms
  for (;;) {
    const v = get()
    if (v) return v
    if (Date.now() > deadline) return null
    await new Promise((r) => setTimeout(r, 200))
  }
}

export async function tryDom(doc: Document = document): Promise<RouteResult> {
  const existing = doc.querySelectorAll(SELECTORS.segment)
  if (existing.length === 0) {
    // The control lives behind "...more" in the description on current YouTube.
    doc.querySelector<HTMLElement>(SELECTORS.expandDescription)?.click()

    const button = await waitFor(() => {
      const all = Array.from(doc.querySelectorAll('button, tp-yt-paper-button'))
      return (
        all.find((b) => /show transcript/i.test(b.textContent ?? '')) as HTMLElement | undefined
      ) ?? null
    }, 4000)

    if (!button) {
      return { ok: false, reason: 'no-captions', detail: 'no Show transcript control on this page' }
    }
    button.click()
  }

  const segments = await waitFor(() => {
    const n = doc.querySelectorAll(SELECTORS.segment)
    return n.length > 0 ? Array.from(n) : null
  }, 8000)

  if (!segments) return { ok: false, reason: 'empty', detail: 'panel opened but rendered no segments' }

  const cues = cuesFromSegments(segments)
  if (cues.length === 0) return { ok: false, reason: 'empty', detail: 'segments carried no text' }
  return { ok: true, route: 'dom', cues }
}
