/**
 * R-VALUE-BOUNDARY (T0) — the single conversion site.
 *
 * `video.currentTime` is a float. Everything downstream of K2 — the note
 * schema, both delivery formats, the `?t=` link — carries INTEGER seconds.
 * hld K4 pins that conversion to exactly one named function, owned by Capture,
 * rounding DOWN, with a test.
 *
 * The service worker never converts. Neither delivery format converts. A
 * second conversion site anywhere is a violation of the rule even if it
 * happens to round the same way, because the point is that there is one place
 * to read and one place to fix.
 */

export interface SegmentBounds {
  /** integer seconds, inclusive */
  start: number
  /** integer seconds, exclusive of nothing — it is the capture instant */
  end: number
}

/**
 * Convert a float playback position and a segment length into integer bounds.
 *
 * Rounds DOWN on both ends. Clamps `start` at 0, so a capture taken 30 seconds
 * into a video with a 180-second window starts at 0 rather than at -150.
 */
export function captureBoundsSeconds(currentTime: number, segmentSeconds: number): SegmentBounds {
  if (!Number.isFinite(currentTime) || currentTime < 0) {
    throw new RangeError(`currentTime must be a finite, non-negative number, got ${currentTime}`)
  }
  if (!Number.isInteger(segmentSeconds) || segmentSeconds <= 0) {
    throw new RangeError(`segmentSeconds must be a positive integer, got ${segmentSeconds}`)
  }
  const end = Math.floor(currentTime)
  const start = Math.max(0, end - segmentSeconds)
  return { start, end }
}
