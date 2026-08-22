import { describe, expect, it, vi } from 'vitest'
import { Session } from '../src/content/session'
import { buildNote } from '../src/worker/note'

const note = buildNote({
  videoId: 'v',
  start: 600,
  end: 780,
  route: 'dom',
  mode: 'captions',
  provider: 'gemini',
  createdAt: '2026-08-22T00:00:00Z',
  claims: [{ text: 'a', span: 'a span of four words' }],
  dropped: [],
})

describe('retry replays stored offsets — it never re-derives from the player', () => {
  it('returns the bounds captured at keystroke time', () => {
    const s = new Session()
    s.hold({ videoId: 'v', start: 600, end: 780, mode: 'captions' })
    expect(s.storedSegment()).toEqual({ videoId: 'v', start: 600, end: 780, mode: 'captions' })
  })

  it('escalating to video keeps the SAME bounds', () => {
    // The video kept playing during a call that may run to 120s. Recomputing
    // would silently capture a different segment than the user asked for.
    const s = new Session()
    s.hold({ videoId: 'v', start: 600, end: 780, mode: 'captions' })
    const next = s.withMode('video')
    expect(next).toEqual({ videoId: 'v', start: 600, end: 780, mode: 'video' })
  })
})

describe('C2 holds the note because C3 dies — F8', () => {
  it('keeps the note after a delivery failure so it can be retried', () => {
    const s = new Session()
    s.holdNote(note)
    // simulate: deliver failed, worker died, page still alive
    expect(s.heldNote()).toBe(note)
  })
})

describe('discard is undo-able for ten seconds, not confirmed', () => {
  it('restores the note if undo is called in time', () => {
    vi.useFakeTimers()
    const s = new Session()
    s.holdNote(note)
    const onExpire = vi.fn()
    const undo = s.discardWithUndo(10_000, onExpire)
    expect(s.heldNote()).toBeNull()
    undo()
    expect(s.heldNote()).toBe(note)
    vi.advanceTimersByTime(20_000)
    expect(onExpire).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('expires after the window and does not restore', () => {
    vi.useFakeTimers()
    const s = new Session()
    s.holdNote(note)
    const onExpire = vi.fn()
    s.discardWithUndo(10_000, onExpire)
    vi.advanceTimersByTime(10_001)
    expect(onExpire).toHaveBeenCalledTimes(1)
    expect(s.heldNote()).toBeNull()
    vi.useRealTimers()
  })
})
