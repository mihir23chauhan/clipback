/**
 * What every adapter does identically, so three copies cannot drift.
 *
 * Deliberately NOT the grounding check — that lives outside the adapters
 * entirely, because it is the one rule that must never vary. This is only the
 * model-walk and the shape parse.
 */
import {
  isValidModelId,
  shouldTryNextModel,
  type AdapterCandidate,
  type ComposeFailure,
  type ComposeResult,
} from './types'

export const PROMPT = `You are given a transcript of part of a video.

Write the specific things that were said: the people, works, numbers and claims
— not the topic.

For EVERY point, quote the exact words from the transcript that support it. Copy
them verbatim, at least a full clause. Do not paraphrase inside the quote.

Return ONLY JSON, no prose and no code fence:
{"candidates":[{"text":"the point","span":"the verbatim words from the transcript"}]}`

export const VIDEO_PROMPT = `${PROMPT}

Also return what you heard, as "transcript": a plain-text transcription of the
segment. Every span you quote must appear in it.`

/**
 * Pull the JSON object out of a model response.
 *
 * Models fence JSON, prefix it with prose, or both. This does not repair
 * malformed JSON — a wrong shape is a FAILED compose, and note.ts decides that.
 */
export function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = (fenced?.[1] ?? raw).trim()
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return undefined
  try {
    return JSON.parse(body.slice(start, end + 1))
  } catch {
    return undefined
  }
}

export function candidatesOf(parsed: unknown): AdapterCandidate[] | undefined {
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const c = (parsed as Record<string, unknown>)['candidates']
  if (!Array.isArray(c)) return undefined
  const out: AdapterCandidate[] = []
  for (const item of c) {
    if (typeof item !== 'object' || item === null) return undefined
    const text = (item as Record<string, unknown>)['text']
    const span = (item as Record<string, unknown>)['span']
    if (typeof text !== 'string' || typeof span !== 'string') return undefined
    out.push({ text, span })
  }
  return out
}

export function transcriptOf(parsed: unknown): string | undefined {
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const t = (parsed as Record<string, unknown>)['transcript']
  return typeof t === 'string' ? t : undefined
}

export const failure = (reason: ComposeFailure['reason'], detail: string): ComposeFailure => ({
  ok: false,
  reason,
  detail,
})

/**
 * Walk `models` in order, calling `attempt` for each, until one answers.
 *
 * FR-011 and F4/F9: a 404 means the id was retired, a 503 means the vendor is
 * busy. Both mean "try the next one, then name the failure". The walk order is
 * the caller's list order, and it is asserted in the conformance suite.
 */
export async function walkModels(
  models: readonly string[],
  attempt: (model: string) => Promise<ComposeResult | { retry: true; status: number }>,
): Promise<ComposeResult> {
  const usable = models.filter(isValidModelId)
  if (usable.length === 0) {
    return failure('no-model-available', 'no configured model id is well-formed')
  }
  let lastStatus = 0
  for (const model of usable) {
    const r = await attempt(model)
    if ('retry' in r) {
      lastStatus = r.status
      if (shouldTryNextModel(r.status)) continue
      return failure('unavailable', `provider returned ${r.status}`)
    }
    return r
  }
  return failure(
    lastStatus === 429 ? 'rate-limited' : 'unavailable',
    `every configured model failed; last status ${lastStatus}`,
  )
}
