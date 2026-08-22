/**
 * The provider adapter contract — hld K3.
 *
 * FR-008 and the requester's central requirement: a fourth vendor costs ONE
 * file plus one line in the registry. Everything that would otherwise leak a
 * vendor name into a call site is expressed here instead.
 */
import type { Cue } from '../grounding'

/** What the caller passes in video mode. Integer seconds — never a provider ref. */
export interface Segment {
  videoId: string
  start: number
  end: number
}

export interface ComposeArgs {
  /** captions mode */
  cues?: readonly Cue[]
  /** video mode */
  segment?: Segment
  prompt: string
  /** The credential. Never logged, never serialised into a note. */
  key: string
  /**
   * FR-012. A PARAMETER, not an adapter constant — this is what lets the user
   * name a model and what lets FR-011 walk the list on 503/404. Without it,
   * retry would be adapter-private behaviour that config could never reach.
   */
  models: readonly string[]
  signal?: AbortSignal
}

/** Unverified model output. Becomes claims only by passing the Verifier. */
export interface AdapterCandidate {
  text: string
  span: string
}

export interface ComposeSuccess {
  ok: true
  candidates: AdapterCandidate[]
  /**
   * Video mode only: the words the model says it heard. This becomes the
   * acquired text the Verifier matches against — a weaker guarantee than
   * captions mode, and the note records which was used.
   */
  transcript?: string
  /** Which model in `models` actually answered. */
  model: string
}

export type ComposeFailureReason =
  | 'bad-shape'
  | 'unauthorized'
  | 'rate-limited'
  | 'unavailable'
  | 'no-model-available'
  | 'unsupported-mode'
  | 'network'
  | 'aborted'

export interface ComposeFailure {
  ok: false
  reason: ComposeFailureReason
  /** Safe to show the user. NEVER contains the key. */
  detail: string
}

export type ComposeResult = ComposeSuccess | ComposeFailure

export interface ProviderAdapter {
  id: string
  label: string
  /**
   * DECLARED, never inferred from `id`. Callers branch on this flag, so adding
   * a vendor never touches a call site — that is the seam.
   */
  supportsVideo: boolean
  defaultModels: string[]
  /**
   * Whether this provider's free tier may train on what is sent. A per-adapter
   * DECLARED FACT, not a runtime lookup — FR-014 gates the first compose on the
   * user acknowledging it.
   */
  freeTierMayTrain: boolean
  compose(args: ComposeArgs): Promise<ComposeResult>
}

/**
 * hld T5. Model ids are user-editable (FR-012) and on at least one vendor sit in
 * the URL path, so every adapter validates before use and CONSTRUCTS its URL
 * from a constant endpoint. An adapter that accepts a URL from config would let
 * anyone who can write config exfiltrate the key.
 */
export const MODEL_ID = /^[A-Za-z0-9._-]+$/

export function isValidModelId(id: string): boolean {
  return MODEL_ID.test(id)
}

/** Which HTTP statuses mean "try the next model in the list" — FR-011, F4, F9. */
export function shouldTryNextModel(status: number): boolean {
  return status === 404 || status === 429 || status === 500 || status === 502 || status === 503
}
