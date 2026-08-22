import { describe, expect, it, vi } from 'vitest'
import { cuesInRange, runLadder } from '../src/main-world/reader'
import { isTerminal } from '../src/main-world/routes/types'
import { cuesFromJson3, isPoTokenGated } from '../src/main-world/routes/baseurl'
import { cuesFromSegments, parseTimestamp } from '../src/main-world/routes/dom'
import { cuesFromTranscriptResponse, findTranscriptParams } from '../src/main-world/routes/innertube'
import type { RouteResult } from '../src/main-world/routes/types'

const ok = (route: 'baseurl' | 'innertube' | 'dom'): RouteResult => ({
  ok: true,
  route,
  cues: [{ t: 0, d: 5, text: 'something was said here' }],
})
const bad = (reason: 'restricted' | 'rate-limited' | 'no-captions' | 'empty'): RouteResult => ({
  ok: false,
  reason,
})

const ladderOf = (b: RouteResult, i: RouteResult, d: RouteResult) => ({
  baseurl: vi.fn(async () => b),
  innertube: vi.fn(async () => i),
  dom: vi.fn(async () => d),
})

describe('the ladder does not thrash — be-testplan group 7', () => {
  it('stops on rate-limited and does NOT try the next rung', async () => {
    // Falling through on a 429 burns all three rungs against a server already
    // asking us to slow down.
    const l = ladderOf(bad('rate-limited'), ok('innertube'), ok('dom'))
    const r = await runLadder(l)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('rate-limited')
    expect(l.innertube).not.toHaveBeenCalled()
    expect(l.dom).not.toHaveBeenCalled()
  })

  it('stops on restricted — the next rung would fail the same way', async () => {
    const l = ladderOf(bad('restricted'), ok('innertube'), ok('dom'))
    const r = await runLadder(l)
    if (!r.ok) expect(r.reason).toBe('restricted')
    expect(l.innertube).not.toHaveBeenCalled()
  })

  it('DOES fall through on empty — that is what the ladder is for', async () => {
    // This is the measured case: rung 1 returns 200 with a zero-byte body.
    const l = ladderOf(bad('empty'), ok('innertube'), ok('dom'))
    const r = await runLadder(l)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.route).toBe('innertube')
    expect(l.dom).not.toHaveBeenCalled()
  })

  it('falls all the way to the DOM when both invisible rungs fail', async () => {
    // The state the signed-out probe found.
    const l = ladderOf(bad('empty'), bad('empty'), ok('dom'))
    const r = await runLadder(l)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.route).toBe('dom')
    expect(l.dom).toHaveBeenCalledTimes(1)
  })

  it('reports the last failure when every rung fails', async () => {
    const l = ladderOf(bad('empty'), bad('empty'), bad('no-captions'))
    const r = await runLadder(l)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('no-captions')
  })

  it('carries route as provenance, so the note can record how it was obtained', async () => {
    const r = await runLadder(ladderOf(ok('baseurl'), ok('innertube'), ok('dom')))
    if (r.ok) expect(r.route).toBe('baseurl')
  })
})

describe('isTerminal', () => {
  it('is terminal only for the two reasons the next rung cannot fix', () => {
    expect(isTerminal('rate-limited')).toBe(true)
    expect(isTerminal('restricted')).toBe(true)
    expect(isTerminal('empty')).toBe(false)
    expect(isTerminal('no-captions')).toBe(false)
  })
})

describe('rung 1 parsing', () => {
  it('recognises a PO-token gated track — the measured wall', () => {
    expect(isPoTokenGated('https://x/api/timedtext?v=a&exp=xpe')).toBe(true)
    expect(isPoTokenGated('https://x/api/timedtext?v=a&exp=xpe&pot=abc')).toBe(false)
    expect(isPoTokenGated('https://x/api/timedtext?v=a')).toBe(false)
  })

  it('parses json3 into cues, joining multi-segment events', () => {
    const cues = cuesFromJson3({
      events: [
        { tStartMs: 0, dDurationMs: 1500, segs: [{ utf8: 'hello ' }, { utf8: 'there' }] },
        { tStartMs: 1500, dDurationMs: 1000, segs: [{ utf8: '\n' }] },
        { tStartMs: 2500, dDurationMs: 1000, segs: [{ utf8: 'again' }] },
      ],
    })
    expect(cues.map((c) => c.text)).toEqual(['hello there', 'again'])
    expect(cues[0]?.t).toBe(0)
    expect(cues[1]?.t).toBe(2.5)
  })
})

describe('rung 2 parsing', () => {
  it('finds the transcript params wherever they sit in the renderer tree', () => {
    const tree = { a: { b: [{ getTranscriptEndpoint: { params: 'AbC123==' } }] } }
    expect(findTranscriptParams(tree)).toBe('AbC123==')
  })

  it('returns undefined when no transcript is offered', () => {
    expect(findTranscriptParams({ a: 1 })).toBeUndefined()
  })

  it('walks segment renderers out of a nested response', () => {
    const cues = cuesFromTranscriptResponse({
      x: [
        { transcriptSegmentRenderer: { startMs: '0', endMs: '2000', snippet: { runs: [{ text: 'first bit' }] } } },
        { transcriptSegmentRenderer: { startMs: '2000', endMs: '5000', snippet: { runs: [{ text: 'second' }, { text: ' bit' }] } } },
      ],
    })
    expect(cues).toHaveLength(2)
    expect(cues[1]?.text).toBe('second bit')
    expect(cues[1]?.d).toBe(3)
  })
})

describe('rung 3 parsing', () => {
  it('parses mm:ss and hh:mm:ss timestamps', () => {
    expect(parseTimestamp('0:05')).toBe(5)
    expect(parseTimestamp('12:34')).toBe(754)
    expect(parseTimestamp('1:02:03')).toBe(3723)
  })

  it('derives each duration from the next start, since the panel gives none', () => {
    const el = (ts: string, text: string) => ({
      querySelector: (s: string) => ({ textContent: s.includes('timestamp') ? ts : text }),
    })
    const cues = cuesFromSegments([el('0:00', 'a'), el('0:10', 'b'), el('0:25', 'c')] as unknown as Element[])
    expect(cues.map((c) => c.d)).toEqual([10, 15, 0])
  })
})

describe('cuesInRange', () => {
  const cues = [
    { t: 0, d: 10, text: 'before' },
    { t: 10, d: 10, text: 'inside' },
    { t: 20, d: 10, text: 'also inside' },
    { t: 100, d: 10, text: 'after' },
  ]

  it('keeps cues overlapping the segment, including partial overlap at the edges', () => {
    expect(cuesInRange(cues, 12, 25).map((c) => c.text)).toEqual(['inside', 'also inside'])
  })

  it('excludes cues wholly outside', () => {
    expect(cuesInRange(cues, 200, 300)).toHaveLength(0)
  })
})
