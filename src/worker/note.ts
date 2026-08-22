/**
 * The note schema — hld K4, the load-bearing contract.
 *
 * DEFINED ONCE. Three provider adapters and two delivery formats depend on it,
 * and R-GENERATED-CODE's instance for this project binds exactly that: no
 * adapter and no delivery format re-declares this shape. A second declaration is
 * the divergence that rule exists to catch, arriving by hand instead of by
 * generator, and nothing would fail loudly when the two drift.
 */
import type { Claim, DroppedClaim } from './grounding'

export type AcquisitionRoute = 'baseurl' | 'innertube' | 'dom'
export type ComposeMode = 'captions' | 'video'

export interface Note {
  videoId: string
  /** integer seconds — converted once, in Capture. Nothing here converts. */
  start: number
  /** integer seconds */
  end: number
  /** provenance: how the words were obtained */
  route: AcquisitionRoute
  /**
   * Which guarantee this note carries. `captions` was checked against a
   * transcript clipback obtained independently of the model. `video` was checked
   * against the model's own account of the audio — self-consistency, not truth.
   * A reader can tell them apart because this field is here.
   */
  mode: ComposeMode
  provider: string
  createdAt: string
  /** MATCHED ONLY. No `matched` flag — see below. */
  claims: Claim[]
  /** The disjoint remainder. Rendered as provenance, never as content. */
  dropped: DroppedClaim[]
}

/** A provider returned valid JSON in the wrong shape. */
export const BAD_SHAPE = 'bad-shape' as const

export interface ShapeOk {
  ok: true
}
export interface ShapeBad {
  ok: false
  reason: typeof BAD_SHAPE
  detail: string
}
export type ShapeResult = ShapeOk | ShapeBad

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isCandidateish = (v: unknown): boolean =>
  isRecord(v) && typeof v['text'] === 'string' && typeof v['span'] === 'string'

/**
 * Validate what an adapter returned, BEFORE any of it becomes a note.
 *
 * A wrong shape is a FAILED compose, not a partial one. Coercing it into a note
 * is how an ungrounded claim reaches the user wearing the right structure —
 * which is precisely what FR-006 forbids.
 */
export function validateAdapterReturn(v: unknown): ShapeResult {
  if (!isRecord(v)) return { ok: false, reason: BAD_SHAPE, detail: 'not an object' }
  const candidates = v['candidates']
  if (!Array.isArray(candidates)) {
    return { ok: false, reason: BAD_SHAPE, detail: 'candidates is not an array' }
  }
  const badAt = candidates.findIndex((c) => !isCandidateish(c))
  if (badAt !== -1) {
    return { ok: false, reason: BAD_SHAPE, detail: `candidates[${badAt}] lacks text/span strings` }
  }
  if ('transcript' in v && typeof v['transcript'] !== 'string') {
    return { ok: false, reason: BAD_SHAPE, detail: 'transcript present but not a string' }
  }
  return { ok: true }
}

export interface BuildNoteInput {
  videoId: string
  start: number
  end: number
  route: AcquisitionRoute
  mode: ComposeMode
  provider: string
  createdAt: string
  claims: Claim[]
  dropped: DroppedClaim[]
}

/**
 * Assemble a note from ALREADY-VERIFIED parts.
 *
 * This function does not ground anything and must never be handed an adapter's
 * return directly — that shortcut is what puts unverified claims in a note. It
 * takes `claims` and `dropped` because the Verifier has already separated them.
 *
 * It refuses non-integer bounds: R-VALUE-BOUNDARY (T0) says the single
 * conversion happens in Capture, so a float arriving here means a second
 * conversion site exists somewhere, and that is the violation.
 */
export function buildNote(input: BuildNoteInput): Note {
  if (!Number.isInteger(input.start) || !Number.isInteger(input.end)) {
    throw new RangeError(
      `note bounds must be integer seconds (R-VALUE-BOUNDARY): got ${input.start}, ${input.end}`,
    )
  }
  return { ...input }
}

/** FR-009 / SC-003 — reach the exact moment in one action. */
export function sourceLink(note: Pick<Note, 'videoId' | 'start'>): string {
  return `https://www.youtube.com/watch?v=${note.videoId}&t=${note.start}s`
}
