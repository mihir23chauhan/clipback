/**
 * Anthropic. Captions mode only in v1 — spec decision 5.
 */
import { joinCues } from '../grounding'
import type { ComposeArgs, ComposeResult, ProviderAdapter } from './types'
import { PROMPT, candidatesOf, extractJson, failure, walkModels } from './shared'

const ENDPOINT = 'https://api.anthropic.com/v1/messages'
const VERSION = '2023-06-01'

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
        headers: {
          'content-type': 'application/json',
          'x-api-key': args.key,
          'anthropic-version': VERSION,
          // The extension calls this API directly from the service worker;
          // without this header the browser preflight is rejected.
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system: PROMPT,
          messages: [{ role: 'user', content: joinCues(args.cues ?? []) }],
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
    const content = body['content']
    const text =
      Array.isArray(content) && typeof (content[0] as Record<string, unknown>)?.['text'] === 'string'
        ? ((content[0] as Record<string, unknown>)['text'] as string)
        : ''

    const candidates = candidatesOf(extractJson(text))
    if (!candidates) return failure('bad-shape', 'the model did not return the candidates shape')
    return { ok: true as const, candidates, model }
  })
}

export const anthropic: ProviderAdapter = {
  id: 'anthropic',
  label: 'Anthropic Claude',
  supportsVideo: false,
  defaultModels: ['claude-sonnet-5', 'claude-haiku-4-5-20251001'],
  freeTierMayTrain: false,
  compose,
}
