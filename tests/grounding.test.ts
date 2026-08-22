import { describe, expect, it } from 'vitest'
import {
  MIN_SPAN_WORDS,
  ground,
  groundAgainstCues,
  groundAgainstModelTranscript,
  joinCues,
  normalise,
  spanIsGrounded,
  type Candidate,
  type Cue,
} from '../src/worker/grounding'

// The case list is be-testplan group 1. Every case is a specific failure that
// was reasoned about before any code existed — not a variation on a theme.

const cues = (...parts: string[]): Cue[] => parts.map((text, i) => ({ t: i * 5, d: 5, text }))

describe('joinCues — step 1', () => {
  it('joins in time order with a single space', () => {
    const out = joinCues([
      { t: 10, d: 5, text: 'second' },
      { t: 0, d: 5, text: 'first' },
    ])
    expect(out).toBe('first second')
  })
})

describe('grounding — the case table', () => {
  it('matches a span crossing a cue boundary', () => {
    // Step 1's whole reason: this span exists in NO individual cue.
    const c = cues('the thing about long form', 'conversation is that it rambles')
    expect(spanIsGrounded('long form conversation is that', joinCues(c))).toBe(true)
  })

  it('REJECTS an empty span', () => {
    // Verified empirically: "" is a substring of every transcript. Without
    // step 3 a model returning empty spans grounds every claim it makes.
    expect(''.includes('')).toBe(true) // the hazard, stated
    expect(spanIsGrounded('', 'anything at all here')).toBe(false)
  })

  it('REJECTS a one-word span', () => {
    expect(spanIsGrounded('the', 'the quick brown fox jumps')).toBe(false)
  })

  it('rejects three words and accepts four — both sides of the floor', () => {
    const source = 'one two three four five'
    expect(MIN_SPAN_WORDS).toBe(4)
    expect(spanIsGrounded('one two three', source)).toBe(false)
    expect(spanIsGrounded('one two three four', source)).toBe(true)
  })

  it('matches across a curly vs straight apostrophe', () => {
    // Over-strictness is the catastrophic direction: this is a perfect quote.
    expect(spanIsGrounded("i don't think that's right", 'well i don’t think that’s right at all')).toBe(true)
  })

  it('matches Devanagari differing only by a zero-width joiner', () => {
    // ZWJ (U+200D) is neither whitespace nor punctuation. Hindi carries it
    // routinely for conjunct control, and this is the ACTUAL failure mode.
    const withZwj = 'यह एक‍ बहुत अच्छी बात'
    const without = 'यह एक बहुत अच्छी बात है'
    expect(spanIsGrounded(withZwj, without)).toBe(true)
  })

  it('matches Devanagari differing only by a zero-width non-joiner', () => {
    const withZwnj = 'हिन्दी‌ में बात करते हैं'
    const without = 'हम हिन्दी में बात करते हैं आज'
    expect(spanIsGrounded(withZwnj, without)).toBe(true)
  })

  it('matches a precomposed nukta against a decomposed one', () => {
    // The real Devanagari normalisation hazard, and it is subtler than
    // "NFC vs NFD". U+095B (ज़) is a Unicode COMPOSITION EXCLUSION, so NFC does
    // not produce it — it folds toward U+091C U+093C (ज + nukta). A model
    // emitting the precomposed form against a transcript carrying the
    // decomposed one is byte-unequal and visually identical. Without NFC on
    // both sides, that span fails, and Hindi ASR mixes both forms freely.
    const precomposed = '\u095B\u0930\u0942\u0930\u0940' // ज़रूरी
    const decomposed = '\u091C\u093C\u0930\u0942\u0930\u0940' // ज + nukta + रूरी
    expect(precomposed).not.toBe(decomposed)
    expect(precomposed.normalize('NFC')).toBe(decomposed.normalize('NFC'))

    const span = `${precomposed} \u092C\u093E\u0924 \u0939\u0948 \u092F\u0939`
    const transcript = `\u092F\u0939 ${decomposed} \u092C\u093E\u0924 \u0939\u0948 \u092F\u0939 \u0938\u091A`
    expect(spanIsGrounded(span, transcript)).toBe(true)
  })

  it('matches across a non-breaking space inside a whitespace run', () => {
    // \s in JS regex does include U+00A0 — assert it rather than assume it.
    expect(spanIsGrounded('four score and seven', 'four  score and  seven years')).toBe(true)
  })

  it('matches case-insensitively', () => {
    expect(spanIsGrounded('THE QUICK BROWN FOX', 'the quick brown fox jumps')).toBe(true)
  })

  it('rejects a span that is simply not there', () => {
    // The base case, and the one that must never regress.
    expect(spanIsGrounded('he endorsed the product warmly', 'they discussed the weather at length')).toBe(false)
  })
})

describe('ground — claims and dropped are disjoint', () => {
  const candidates: Candidate[] = [
    { text: 'A real point', span: 'the transcript actually said this' },
    { text: 'An invented point', span: 'the transcript never said this bit' },
    { text: 'A vacuous span', span: '' },
  ]
  const source = 'well the transcript actually said this and then moved on'

  it('emits only matched claims', () => {
    const r = ground(candidates, source)
    expect(r.claims).toHaveLength(1)
    expect(r.claims[0]?.text).toBe('A real point')
  })

  it('drops the rest with a named reason, and the two sets are disjoint', () => {
    const r = ground(candidates, source)
    expect(r.dropped).toHaveLength(2)
    expect(r.dropped.every((d) => d.reason === 'span-not-found')).toBe(true)
    expect(r.claims.length + r.dropped.length).toBe(candidates.length)
    const claimTexts = new Set(r.claims.map((c) => c.text))
    expect(r.dropped.some((d) => claimTexts.has(d.text))).toBe(false)
  })

  it('has no matched flag to render falsely', () => {
    const r = ground(candidates, source)
    expect(r.claims[0]).not.toHaveProperty('matched')
  })
})

describe('both modes use the same function', () => {
  const candidates: Candidate[] = [{ text: 'x', span: 'a claim worth checking here' }]

  it('captions mode grounds against the acquired cues', () => {
    const r = groundAgainstCues(candidates, cues('this is', 'a claim worth checking here today'))
    expect(r.claims).toHaveLength(1)
  })

  it('video mode grounds against the model transcript, identically', () => {
    const r = groundAgainstModelTranscript(candidates, 'this is a claim worth checking here today')
    expect(r.claims).toHaveLength(1)
  })

  it('video mode is not exempt from the floor — the guarantee is weaker, not absent', () => {
    const r = groundAgainstModelTranscript([{ text: 'x', span: '' }], 'anything')
    expect(r.claims).toHaveLength(0)
    expect(r.dropped).toHaveLength(1)
  })
})

describe('normalise is idempotent', () => {
  it('normalising twice changes nothing', () => {
    const s = 'Hé‍! Don’t —  stop now.'
    expect(normalise(normalise(s))).toBe(normalise(s))
  })
})
