import { describe, expect, it } from 'vitest'
import { buildNote, sourceLink, validateAdapterReturn } from '../src/worker/note'

describe('validateAdapterReturn — a wrong shape is a FAILED compose', () => {
  it('accepts the K3 shape', () => {
    expect(validateAdapterReturn({ candidates: [{ text: 'a', span: 'b' }] }).ok).toBe(true)
  })

  it('accepts video mode, which carries a transcript alongside', () => {
    expect(validateAdapterReturn({ candidates: [], transcript: 'what it heard' }).ok).toBe(true)
  })

  it('rejects valid JSON in the wrong shape rather than coercing it', () => {
    // be-testplan: fixture that is well-formed and wrong. Coercing this is how
    // an ungrounded claim reaches the user wearing the right structure.
    const r = validateAdapterReturn({ summary: 'a perfectly nice summary string' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('bad-shape')
  })

  it('rejects a candidate missing its span — the field grounding depends on', () => {
    const r = validateAdapterReturn({ candidates: [{ text: 'a' }] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.detail).toContain('candidates[0]')
  })

  it('rejects a non-string transcript', () => {
    expect(validateAdapterReturn({ candidates: [], transcript: 42 }).ok).toBe(false)
  })
})

describe('buildNote', () => {
  const base = {
    videoId: 'abc123',
    start: 600,
    end: 780,
    route: 'innertube' as const,
    mode: 'captions' as const,
    provider: 'gemini',
    createdAt: '2026-08-22T00:00:00Z',
    claims: [{ text: 'x', span: 'a span of four words' }],
    dropped: [],
  }

  it('carries mode, so a reader can tell the two guarantees apart', () => {
    expect(buildNote({ ...base, mode: 'video' }).mode).toBe('video')
  })

  it('has no field a delivery adapter could render as a false matched flag', () => {
    const n = buildNote(base)
    expect(n.claims[0]).not.toHaveProperty('matched')
    expect(n).not.toHaveProperty('matched')
  })

  it('has no field that could carry a credential', () => {
    // hld T4. The schema is the mitigation; assert it structurally.
    const keys = Object.keys(buildNote(base))
    expect(keys).not.toContain('key')
    expect(keys).not.toContain('apiKey')
    expect(JSON.stringify(buildNote(base))).not.toMatch(/AIza|sk-|Bearer/)
  })

  it('REFUSES float bounds — R-VALUE-BOUNDARY (T0)', () => {
    // A float arriving here means a second conversion site exists somewhere.
    expect(() => buildNote({ ...base, start: 600.5 })).toThrow(RangeError)
    expect(() => buildNote({ ...base, end: 780.2 })).toThrow(RangeError)
  })
})

describe('sourceLink — FR-009 / SC-003', () => {
  it('links to the exact start, in integer seconds', () => {
    expect(sourceLink({ videoId: 'abc123', start: 600 })).toBe(
      'https://www.youtube.com/watch?v=abc123&t=600s',
    )
  })
})
