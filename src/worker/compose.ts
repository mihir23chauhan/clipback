/**
 * K2 — the compose handler.
 *
 * This is where the trust boundary is enforced. An adapter returns
 * `candidates[]`: unverified model output. It becomes `claims[]` ONLY after the
 * Grounding Verifier has passed it. The obvious wrong implementation — hand the
 * adapter's return to the note builder — would put unverified claims into a note
 * wearing the right structure, which is exactly what FR-006 forbids.
 *
 * Nothing is cached across a call. The worker dies; every read is fresh.
 */
import { adapterById } from './adapters'
import type { ComposeFailureReason } from './adapters/types'
import { groundAgainstCues, groundAgainstModelTranscript, type Cue } from './grounding'
import { buildNote, validateAdapterReturn, type Note } from './note'
import { readCredentials, readSettings } from './config'

export interface ComposeRequest {
  videoId: string
  /** integer seconds — converted once, in Capture. Nothing here converts. */
  start: number
  end: number
  route: 'baseurl' | 'innertube' | 'dom'
  mode: 'captions' | 'video'
  cues?: Cue[]
}

export type ComposeReason =
  | ComposeFailureReason
  | 'no-key'
  | 'no-provider'
  | 'disclosure-required'
  | 'ungrounded'
  | 'no-video-support'

export interface ComposeOk {
  ok: true
  note: Note
}
export interface ComposeErr {
  ok: false
  reason: ComposeReason
  detail: string
  /** FR-014 / spec decision 5 — the UI names the provider in its message. */
  provider?: string
}
export type ComposeResponse = ComposeOk | ComposeErr

export async function compose(
  req: ComposeRequest,
  now: () => string = () => new Date().toISOString(),
): Promise<ComposeResponse> {
  const settings = await readSettings()
  const adapter = adapterById(settings.provider)
  if (!adapter) {
    return { ok: false, reason: 'no-provider', detail: 'no provider is configured' }
  }

  /**
   * F10 — the disclosure gate is enforced HERE, in the worker, not in the
   * options page. A check that lives only in C4 is one the user can walk around.
   * Compose does not run; there is no silent proceed.
   */
  if (adapter.freeTierMayTrain && !settings.disclosureShown) {
    return {
      ok: false,
      reason: 'disclosure-required',
      detail: 'review how this provider handles your data',
      provider: adapter.label,
    }
  }

  if (req.mode === 'video' && !adapter.supportsVideo) {
    // Told, not discovered — spec decision 5.
    return {
      ok: false,
      reason: 'no-video-support',
      detail: 'video mode is not available on this provider in v1',
      provider: adapter.label,
    }
  }

  const { apiKey } = await readCredentials()
  if (!apiKey) return { ok: false, reason: 'no-key', detail: 'add your API key to start' }

  const models = settings.models.length > 0 ? settings.models : adapter.defaultModels

  const result = await adapter.compose({
    ...(req.mode === 'video'
      ? { segment: { videoId: req.videoId, start: req.start, end: req.end } }
      : { cues: req.cues ?? [] }),
    prompt: '',
    key: apiKey,
    models,
  })

  if (!result.ok) {
    return { ok: false, reason: result.reason, detail: result.detail, provider: adapter.label }
  }

  // A wrong shape is a FAILED compose, not a partial one.
  const shape = validateAdapterReturn(result)
  if (!shape.ok) {
    return { ok: false, reason: 'bad-shape', detail: shape.detail, provider: adapter.label }
  }

  /**
   * The verification step. `candidates` has NOT been checked until this line.
   *
   * In video mode the source is the transcript the adapter itself returned — a
   * weaker guarantee, self-consistency rather than truth, and `mode` records
   * which was used so a reader and `evals` can tell them apart.
   */
  const grounded =
    req.mode === 'video'
      ? groundAgainstModelTranscript(result.candidates, result.transcript ?? '')
      : groundAgainstCues(result.candidates, req.cues ?? [])

  // FR-006a — when nothing survives, say so and write NO note.
  if (grounded.claims.length === 0) {
    return {
      ok: false,
      reason: 'ungrounded',
      detail: 'the transcript did not support any claims',
      provider: adapter.label,
    }
  }

  return {
    ok: true,
    note: buildNote({
      videoId: req.videoId,
      start: req.start,
      end: req.end,
      route: req.route,
      mode: req.mode,
      provider: adapter.id,
      createdAt: now(),
      claims: grounded.claims,
      dropped: grounded.dropped,
    }),
  }
}
