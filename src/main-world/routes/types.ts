import type { Cue } from '../../worker/grounding'

export type Route = 'baseurl' | 'innertube' | 'dom'

/**
 * FOUR reasons, never a boolean.
 *
 * A ladder that collapses these thrashes through every rung on a 429, and tells
 * the user something false — SC-005 forbids that in a product whose whole
 * proposition is not asserting things that are not so.
 */
export type FailureReason = 'restricted' | 'rate-limited' | 'no-captions' | 'empty'

export interface RouteSuccess {
  ok: true
  route: Route
  cues: Cue[]
}

export interface RouteFailure {
  ok: false
  reason: FailureReason
  detail?: string
}

export type RouteResult = RouteSuccess | RouteFailure

/** Only these two mean "stop; the next rung will fail the same way". */
export function isTerminal(reason: FailureReason): boolean {
  return reason === 'rate-limited' || reason === 'restricted'
}
