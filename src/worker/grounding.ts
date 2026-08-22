/**
 * The Grounding Verifier — hld K4, steps 1 to 4.
 *
 * This is the mechanism the product rests on. A claim is emitted only if the
 * verbatim span it cites can be found in the text clipback actually acquired.
 * There is no model here on purpose: checking a model's work with a model
 * recreates the problem one layer up, and string matching cannot be talked out
 * of its answer.
 *
 * ONE function owns the whole match. Captions mode and video mode both call it —
 * video mode against the transcript the adapter itself returned. Two
 * implementations would be the drift this component exists to prevent.
 *
 * There are two ways to break this and they fail in opposite directions:
 *
 *   TOO LOOSE   grounds claims it should not. The catastrophic case is proven:
 *               "" is a substring of every transcript, so a model returning
 *               empty spans would ground EVERY claim. Step 3 is the floor that
 *               stops it.
 *
 *   TOO STRICT  grounds nothing. A model returning NFC against an NFD Hindi
 *               transcript fails every span, and quality goal 1 is then
 *               trivially satisfied by a product that never works and pushes the
 *               user to the paid mode on every capture.
 *
 * Neither throws. Both are silent. That is why the suite for this file is the
 * largest in the project.
 */

/** A cue as acquired from any of the three rungs. */
export interface Cue {
  /** start, seconds */
  t: number
  /** duration, seconds */
  d: number
  text: string
}

/** Unverified model output — hld K3. Becomes a claim only by passing here. */
export interface Candidate {
  text: string
  span: string
}

/** A candidate that matched. */
export interface Claim {
  text: string
  span: string
}

/** A candidate that did not. */
export interface DroppedClaim {
  text: string
  span: string
  reason: 'span-not-found'
}

export interface GroundingResult {
  claims: Claim[]
  dropped: DroppedClaim[]
}

/** A span must survive normalisation with at least this many words. */
export const MIN_SPAN_WORDS = 4

/**
 * Step 1 — join cues in time order with a SINGLE SPACE.
 *
 * Matching is against this one string, never per-cue: a span crossing a cue
 * boundary is entirely normal and would match no individual cue.
 */
export function joinCues(cues: readonly Cue[]): string {
  return [...cues]
    .sort((a, b) => a.t - b.t)
    .map((c) => c.text)
    .join(' ')
}

/**
 * Step 2 — normalise both sides identically, in this order.
 *
 * NFC first, because the motivating content is Hindi ASR that transliterates
 * English into Devanagari, which has composed and decomposed forms that are
 * visually identical and byte-unequal.
 *
 * Then zero-width characters, and they are the ACTUAL Devanagari failure mode:
 * ZWJ and ZWNJ are neither whitespace nor punctuation, Hindi carries them
 * routinely for conjunct control, and two visually identical strings differing
 * only by one do not match.
 *
 * Punctuation is stripped for the same reason NFC is applied — over-strictness
 * is the catastrophic direction. A curly apostrophe against a straight one, or a
 * sentence-final period the model added, would fail an otherwise perfect quote.
 */
export function normalise(s: string): string {
  return s
    .normalize('NFC')
    // Alternation, not a character class: ESLint's no-misleading-character-class
    // is right that ZWJ inside a class is ambiguous, because ZWJ is also what
    // joins emoji sequences. Stripping it as a standalone alternative says what
    // is meant — remove these four code points wherever they appear.
    .replace(/\u200B|\u200C|\u200D|\uFEFF/g, '')
    .replace(/[\p{P}\p{S}]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase()
}

/** Step 3 — reject trivial spans BEFORE comparing. */
export function isSpanSubstantial(normalisedSpan: string): boolean {
  if (normalisedSpan.length === 0) return false
  return normalisedSpan.split(' ').filter(Boolean).length >= MIN_SPAN_WORDS
}

/**
 * Steps 1-4 for a single span against already-joined source text.
 *
 * `sourceText` is the raw joined text; it is normalised here so callers cannot
 * accidentally normalise one side and not the other.
 */
export function spanIsGrounded(span: string, sourceText: string): boolean {
  const nSpan = normalise(span)
  if (!isSpanSubstantial(nSpan)) return false
  return normalise(sourceText).includes(nSpan)
}

/**
 * The whole check, over a set of candidates.
 *
 * `claims` contains ONLY what matched. There is no `matched` flag, because a
 * flag invites a delivery adapter to render a false one — carrying an ungrounded
 * claim into a note wearing the right structure, which is what FR-006 forbids.
 * `dropped` is the disjoint remainder and is rendered as provenance, never as
 * content.
 */
export function ground(candidates: readonly Candidate[], sourceText: string): GroundingResult {
  const normalisedSource = normalise(sourceText)
  const claims: Claim[] = []
  const dropped: DroppedClaim[] = []

  for (const c of candidates) {
    const nSpan = normalise(c.span)
    if (isSpanSubstantial(nSpan) && normalisedSource.includes(nSpan)) {
      claims.push({ text: c.text, span: c.span })
    } else {
      dropped.push({ text: c.text, span: c.span, reason: 'span-not-found' })
    }
  }

  return { claims, dropped }
}

/** Captions mode: the source is the acquired cues. */
export function groundAgainstCues(
  candidates: readonly Candidate[],
  cues: readonly Cue[],
): GroundingResult {
  return ground(candidates, joinCues(cues))
}

/**
 * Video mode: the source is the transcript the MODEL returned.
 *
 * Same function, deliberately. But this is a WEAKER guarantee and the caller
 * must label it as one: caption grounding checks a claim against a transcript
 * clipback obtained independently of the model, whereas this checks it against
 * the model's own account of the audio. It verifies self-consistency, not truth
 * — it catches a model inventing content beyond what it transcribed, and it
 * cannot catch a model mis-hearing the audio.
 *
 * The note records `mode`, so a reader can tell the two apart, and `evals`
 * scores them separately.
 */
export function groundAgainstModelTranscript(
  candidates: readonly Candidate[],
  transcript: string,
): GroundingResult {
  return ground(candidates, transcript)
}
