/**
 * OpenAI. Captions mode only in v1 — spec decision 5.
 *
 * `supportsVideo: false` is a DECLARED fact, and the user is told at the point
 * they would choose video mode rather than left to discover it.
 */
import { joinCues } from '../grounding'
import type { ComposeArgs, ComposeResult, ProviderAdapter } from './types'
import { PROMPT, candidatesOf, extractJson, failure, walkModels } from './shared'

const ENDPOINT = 'https://api.openai.com/v1/chat/completions'

async function compose(args: ComposeArgs): Promise<ComposeResult> {
  if (args.segment) {
    return failure('unsupported-mode', 'video mode is not available on this provider in v1')
  }
  if (!args.cues) return failure('bad-shape', 'no cues supplied')

  return walkModels(args.models, async (model) => {
    let res: Response
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${args.key}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: PROMPT },
            { role: 'user', content: joinCues(args.cues ?? []) },
          ],
        }),
        ...(args.signal ? { signal: args.signal } : {}),
      })
    } catch (e) {
      if (args.signal?.aborted) return failure('aborted', 'cancelled')
      return failure('network', `could not reach the provider: ${String(e)}`)
    }

    if (res.status === 401 || res.status === 403) {
      return failure('unauthorized', 'the provider rejected this API key')
    }
    if (!res.ok) return { retry: true as const, status: res.status }

    const body = (await res.json()) as Record<string, unknown>
    const choices = body['choices']
    const msg = Array.isArray(choices)
      ? ((choices[0] as Record<string, unknown>)?.['message'] as Record<string, unknown> | undefined)
      : undefined
    const text = typeof msg?.['content'] === 'string' ? (msg['content'] as string) : ''

    const candidates = candidatesOf(extractJson(text))
    if (!candidates) return failure('bad-shape', 'the model did not return the candidates shape')
    return { ok: true as const, candidates, model }
  })
}

export const openai: ProviderAdapter = {
  id: 'openai',
  label: 'OpenAI',
  supportsVideo: false,
  defaultModels: ['gpt-5', 'gpt-4.1'],
  freeTierMayTrain: false,
  compose,
}
