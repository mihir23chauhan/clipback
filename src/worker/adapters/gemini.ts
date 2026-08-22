/**
 * Google Gemini. The one vendor verified for video mode in v1.
 *
 * Endpoint is a CONSTANT here. Model ids come from config and are validated
 * before use, then the URL is CONSTRUCTED — hld T5, and it matters because on
 * this vendor the model id sits in the URL path.
 */
import { joinCues } from '../grounding'
import type { ComposeArgs, ComposeResult, ProviderAdapter } from './types'
import {
  PROMPT,
  VIDEO_PROMPT,
  candidatesOf,
  extractJson,
  failure,
  transcriptOf,
  walkModels,
} from './shared'

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

async function compose(args: ComposeArgs): Promise<ComposeResult> {
  const video = Boolean(args.segment)
  if (!video && !args.cues) return failure('bad-shape', 'neither cues nor segment supplied')

  return walkModels(args.models, async (model) => {
    // CONSTRUCTED from a constant + a validated id. Never accepted from config.
    const url = `${ENDPOINT}/${model}:generateContent`

    const parts: unknown[] = [{ text: video ? VIDEO_PROMPT : PROMPT }]
    if (video && args.segment) {
      parts.push({
        // The adapter builds the provider's own offset encoding. The caller
        // passed integer seconds and knows nothing about this shape.
        file_data: { file_uri: `https://www.youtube.com/watch?v=${args.segment.videoId}` },
        video_metadata: {
          start_offset: `${args.segment.start}s`,
          end_offset: `${args.segment.end}s`,
        },
      })
    } else {
      parts.push({ text: joinCues(args.cues ?? []) })
    }

    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': args.key },
        body: JSON.stringify({ contents: [{ parts }] }),
        ...(args.signal ? { signal: args.signal } : {}),
      })
    } catch (e) {
      if (args.signal?.aborted) return failure('aborted', 'cancelled')
      return failure('network', `could not reach the provider: ${String(e)}`)
    }

    if (res.status === 401 || res.status === 403) {
      return failure('unauthorized', 'the provider rejected this API key')
    }

    // Gemini reports an INVALID KEY as 400 INVALID_ARGUMENT, not 401/403.
    // Found by running it: without this the user is told "the provider is busy"
    // when in fact their key is wrong, and the model walk burns every id
    // getting there. Telling the user something false about why it failed is
    // what SC-005 forbids.
    if (res.status === 400) {
      const text = await res.text()
      if (text.includes('API_KEY_INVALID') || text.includes('API key not valid')) {
        return failure('unauthorized', 'the provider rejected this API key')
      }
      return failure('bad-shape', `the provider rejected the request: ${text.slice(0, 200)}`)
    }

    if (!res.ok) return { retry: true as const, status: res.status }

    const body = (await res.json()) as Record<string, unknown>
    const cands = body['candidates']
    const first = Array.isArray(cands) ? (cands[0] as Record<string, unknown> | undefined) : undefined
    const content = first?.['content'] as Record<string, unknown> | undefined
    const outParts = content?.['parts']
    const text =
      Array.isArray(outParts) && typeof (outParts[0] as Record<string, unknown>)?.['text'] === 'string'
        ? ((outParts[0] as Record<string, unknown>)['text'] as string)
        : ''

    const parsed = extractJson(text)
    const candidates = candidatesOf(parsed)
    if (!candidates) return failure('bad-shape', 'the model did not return the candidates shape')

    const transcript = transcriptOf(parsed)
    return {
      ok: true as const,
      candidates,
      model,
      ...(transcript !== undefined ? { transcript } : {}),
    }
  })
}

export const gemini: ProviderAdapter = {
  id: 'gemini',
  label: 'Google Gemini',
  supportsVideo: true,
  defaultModels: ['gemini-3.6-flash', 'gemini-2.5-flash'],
  freeTierMayTrain: true,
  compose,
}
