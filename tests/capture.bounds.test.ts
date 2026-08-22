import { describe, expect, it } from 'vitest'
import { captureBoundsSeconds } from '../src/content/capture'

// R-VALUE-BOUNDARY (T0). This is the test the rule's instance names.
describe('captureBoundsSeconds', () => {
  it('rounds down, never to nearest', () => {
    expect(captureBoundsSeconds(3.9, 1).end).toBe(3)
    expect(captureBoundsSeconds(3.1, 1).end).toBe(3)
    expect(captureBoundsSeconds(0.0, 1).end).toBe(0)
  })

  it('returns integers on both ends', () => {
    const { start, end } = captureBoundsSeconds(783.4162, 180)
    expect(Number.isInteger(start)).toBe(true)
    expect(Number.isInteger(end)).toBe(true)
    expect(start).toBe(603)
    expect(end).toBe(783)
  })

  it('clamps start at zero rather than going negative', () => {
    // 30s into the video with a 180s window: the segment is the whole video so far
    expect(captureBoundsSeconds(30.7, 180)).toEqual({ start: 0, end: 30 })
  })

  it('rejects a non-finite or negative position', () => {
    expect(() => captureBoundsSeconds(Number.NaN, 180)).toThrow(RangeError)
    expect(() => captureBoundsSeconds(Number.POSITIVE_INFINITY, 180)).toThrow(RangeError)
    expect(() => captureBoundsSeconds(-1, 180)).toThrow(RangeError)
  })

  it('rejects a non-integer or non-positive segment length', () => {
    expect(() => captureBoundsSeconds(100, 180.5)).toThrow(RangeError)
    expect(() => captureBoundsSeconds(100, 0)).toThrow(RangeError)
  })
})
