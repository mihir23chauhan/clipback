import { describe, expect, it } from 'vitest'
import { TOAST, Toast } from '../src/content/ui/Toast'
import { STRINGS, TIMERS } from '../src/content/strings'

const noop = () => {}

describe('the per-mode timers — the single-number version was rejected', () => {
  it('captions is 5s slow / 20s timeout', () => {
    expect(TIMERS.captions.slow).toBe(5_000)
    expect(TIMERS.captions.timeout).toBe(20_000)
  })

  it('video is 60s slow / 90s downgrade / 120s timeout', () => {
    expect(TIMERS.video.slow).toBe(60_000)
    expect(TIMERS.video.downgrade).toBe(90_000)
    expect(TIMERS.video.timeout).toBe(120_000)
  })

  it('the rejected 8-second threshold appears nowhere', () => {
    // "the average of two numbers that should never have been averaged"
    const all = JSON.stringify(TIMERS)
    expect(all).not.toContain('8000')
  })

  it('a client deadline exists for BOTH modes — a hang is not permitted', () => {
    // MV3 kills the worker; a request with no deadline produces silence.
    expect(TIMERS.captions.timeout).toBeGreaterThan(0)
    expect(TIMERS.video.timeout).toBeGreaterThan(0)
  })
})

describe('the toast text changes at each threshold, not just a timer firing', () => {
  it('captions slow says so, without naming a provider', () => {
    expect(TOAST.slow('captions', 'Gemini', noop).message).toBe(STRINGS.slowCaptions)
  })

  it('video slow names the provider', () => {
    expect(TOAST.slow('video', 'Gemini', noop).message).toContain('Gemini')
  })

  it('the 90s state offers the free path', () => {
    const s = TOAST.downgradeOffer(noop, noop)
    expect(s.message).toContain('captions')
    expect(s.actions?.[0]?.label).toBe(STRINGS.useCaptionsInstead)
  })

  it('the video timeout says the clip is kept AND that it may still be billed', () => {
    const m = TOAST.timedOut('video', 'Gemini', noop, noop).message
    expect(m).toContain('clip is kept')
    expect(m).toContain('may still be billed')
  })
})

describe('two rejected patterns must never reappear', () => {
  const everyState = [
    TOAST.capturing('captions', 180),
    TOAST.capturing('video', 180),
    TOAST.slow('captions', 'p', noop),
    TOAST.slow('video', 'p', noop),
    TOAST.downgradeOffer(noop, noop),
    TOAST.timedOut('video', 'p', noop, noop),
    TOAST.saved(noop),
    TOAST.partial(2, noop, noop),
    TOAST.ungrounded(noop, noop),
    TOAST.noTranscript(noop, noop),
    TOAST.rateLimited(noop),
    TOAST.restricted(noop),
    TOAST.noKey(noop),
    TOAST.offline(),
  ]

  it('no state renders a percentage', () => {
    // An honest percentage cannot be computed here, and a fabricated one is the
    // exact failure this product exists to avoid.
    for (const s of everyState) {
      expect(`${s.message} ${s.sub ?? ''}`).not.toMatch(/\d+\s*%/)
    }
  })

  it('no state renders an elapsed-time counter', () => {
    for (const s of everyState) {
      expect(`${s.message} ${s.sub ?? ''}`).not.toMatch(/\d+\s*(seconds?|secs?) elapsed/i)
    }
  })

  it('no state uses the word "AI"', () => {
    for (const s of everyState) {
      expect(s.message).not.toMatch(/\bAI\b/)
    }
  })

  it('every failure state says what to do next', () => {
    const failures = [
      TOAST.ungrounded(noop, noop),
      TOAST.noTranscript(noop, noop),
      TOAST.rateLimited(noop),
      TOAST.noKey(noop),
      TOAST.timedOut('video', 'p', noop, noop),
    ]
    for (const s of failures) expect(s.actions?.length ?? 0).toBeGreaterThan(0)
  })
})

describe('ungrounded is NOT an error — the ruling adherence rule 7 encodes', () => {
  it('uses the neutral tone, never a danger tone', () => {
    expect(TOAST.ungrounded(noop, noop).tone).toBe('ungrounded')
  })

  it('renders with the neutral token class, not a danger class', () => {
    document.body.replaceChildren()
    new Toast().show(TOAST.ungrounded(noop, noop))
    const el = document.querySelector('.clipback-toast')
    expect(el?.className).toContain('clipback-toast--ungrounded')
    expect(el?.className).not.toMatch(/error|danger|--partial|--grounded/)
  })

  it('offers video and discard, and discard is the quieter one', () => {
    const s = TOAST.ungrounded(noop, noop)
    expect(s.actions?.[0]?.label).toBe(STRINGS.tryVideo)
    expect(s.actions?.[1]?.secondary).toBe(true)
  })
})

describe('F1b and F1c offer no video escalation', () => {
  it('rate-limited does not — nothing is wrong with the video', () => {
    const labels = TOAST.rateLimited(noop).actions?.map((a) => a.label) ?? []
    expect(labels).not.toContain(STRINGS.tryVideo)
  })

  it('restricted does not — it would fail there too', () => {
    const labels = TOAST.restricted(noop).actions?.map((a) => a.label) ?? []
    expect(labels).not.toContain(STRINGS.tryVideo)
  })

  it('no-transcript DOES — video supplies its own transcript', () => {
    const labels = TOAST.noTranscript(noop, noop).actions?.map((a) => a.label) ?? []
    expect(labels).toContain(STRINGS.tryVideo)
  })
})

describe('the three-visible-states cap', () => {
  it('counts transitions so a capture can be held to three', () => {
    document.body.replaceChildren()
    const t = new Toast()
    t.show(TOAST.capturing('captions', 180))
    t.show(TOAST.slow('captions', 'p', noop))
    t.show(TOAST.saved(noop))
    expect(t.visibleStates).toBe(3)
  })

  it('resets per capture', () => {
    document.body.replaceChildren()
    const t = new Toast()
    t.show(TOAST.capturing('captions', 180))
    t.reset()
    expect(t.visibleStates).toBe(0)
  })
})

describe('the toast writes text, never markup', () => {
  it('renders a hostile message as text', () => {
    document.body.replaceChildren()
    new Toast().show({ message: '<img src=x onerror=alert(1)>', tone: 'neutral' })
    expect(document.querySelectorAll('img')).toHaveLength(0)
    expect(document.body.textContent).toContain('<img src=x onerror=alert(1)>')
  })

  it('is announced politely to assistive tech', () => {
    document.body.replaceChildren()
    new Toast().show(TOAST.saved(noop))
    const el = document.querySelector('[role="status"]')
    expect(el?.getAttribute('aria-live')).toBe('polite')
  })
})
