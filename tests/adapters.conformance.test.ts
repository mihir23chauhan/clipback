import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ADAPTERS, adapterById, videoCapableAdapters } from '../src/worker/adapters'
import { isValidModelId, shouldTryNextModel } from '../src/worker/adapters/types'
import type { Cue } from '../src/worker/grounding'

const cues: Cue[] = [{ t: 0, d: 5, text: 'they discussed the film Baazigar at some length' }]
const KEY = 'test-key-not-a-real-credential'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** Each vendor wraps the model's text differently; this is the only per-vendor knowledge here. */
const wrap = (id: string, text: string): unknown => {
  if (id === 'gemini') return { candidates: [{ content: { parts: [{ text }] } }] }
  if (id === 'openai') return { choices: [{ message: { content: text } }] }
  return { content: [{ type: 'text', text }] }
}

const GOOD = JSON.stringify({
  candidates: [{ text: 'They discussed Baazigar', span: 'they discussed the film Baazigar' }],
})

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('the registry', () => {
  it('registers three adapters and finds them by id', () => {
    expect(ADAPTERS).toHaveLength(3)
    for (const a of ADAPTERS) expect(adapterById(a.id)).toBe(a)
  })

  it('exposes video capability as a filter on a declared flag, not a vendor name', () => {
    const video = videoCapableAdapters()
    expect(video.every((a) => a.supportsVideo)).toBe(true)
    // v1: exactly one vendor is verified for video — spec decision 5.
    expect(video).toHaveLength(1)
  })
})

// One suite, every adapter. A fourth vendor should pass this without a new test
// being written; if it needs a special case, that is a finding about K3.
describe.each(ADAPTERS.map((a) => [a.id, a] as const))('conformance: %s', (_id, adapter) => {
  it('declares the full K3 shape', () => {
    expect(typeof adapter.id).toBe('string')
    expect(typeof adapter.label).toBe('string')
    expect(typeof adapter.compose).toBe('function')
    expect(adapter.defaultModels.length).toBeGreaterThan(0)
  })

  it('declares supportsVideo as a boolean, not derived from its id', () => {
    expect(typeof adapter.supportsVideo).toBe('boolean')
  })

  it('declares whether its free tier may train — FR-014 needs a fact, not a lookup', () => {
    expect(typeof adapter.freeTierMayTrain).toBe('boolean')
  })

  it('every default model id is well-formed', () => {
    for (const m of adapter.defaultModels) expect(isValidModelId(m)).toBe(true)
  })

  it('returns candidates, never claims', async () => {
    fetchMock.mockResolvedValue(jsonResponse(wrap(adapter.id, GOOD)))
    const r = await adapter.compose({ cues, prompt: '', key: KEY, models: adapter.defaultModels })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.candidates[0]?.span).toBe('they discussed the film Baazigar')
      expect(r).not.toHaveProperty('claims')
    }
  })

  it('treats valid JSON in the WRONG shape as bad-shape, not a partial result', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(wrap(adapter.id, JSON.stringify({ summary: 'a nice summary' }))),
    )
    const r = await adapter.compose({ cues, prompt: '', key: KEY, models: adapter.defaultModels })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('bad-shape')
  })

  it('walks models IN ORDER on 503, then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'busy' }, 503))
      .mockResolvedValueOnce(jsonResponse(wrap(adapter.id, GOOD)))
    const r = await adapter.compose({
      cues,
      prompt: '',
      key: KEY,
      models: ['model-alpha', 'model-beta'],
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.model).toBe('model-beta')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('walks past a 404 — a retired model id (F9)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'no such model' }, 404))
      .mockResolvedValueOnce(jsonResponse(wrap(adapter.id, GOOD)))
    const r = await adapter.compose({ cues, prompt: '', key: KEY, models: ['gone', 'present'] })
    expect(r.ok).toBe(true)
  })

  it('names the failure when every model fails', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'busy' }, 503))
    const r = await adapter.compose({ cues, prompt: '', key: KEY, models: ['a', 'b'] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('unavailable')
  })

  it('reports a rejected key as unauthorized rather than retrying it', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'bad key' }, 401))
    const r = await adapter.compose({ cues, prompt: '', key: KEY, models: ['a', 'b'] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('unauthorized')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('REFUSES a hostile model id and never puts it in a URL — hld T5', async () => {
    const hostile = '../../../evil.example.com/v1/models/x'
    expect(isValidModelId(hostile)).toBe(false)
    const r = await adapter.compose({ cues, prompt: '', key: KEY, models: [hostile] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('no-model-available')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('never leaks the key into a user-facing detail string', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'bad key' }, 401))
    const r = await adapter.compose({ cues, prompt: '', key: KEY, models: ['a'] })
    if (!r.ok) expect(r.detail).not.toContain(KEY)
  })

  it('constructs its endpoint from a constant — config cannot redirect it', async () => {
    fetchMock.mockResolvedValue(jsonResponse(wrap(adapter.id, GOOD)))
    await adapter.compose({ cues, prompt: '', key: KEY, models: adapter.defaultModels })
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url.startsWith('https://')).toBe(true)
    expect(url).not.toContain('..')
  })

  it('either supports video, or refuses it by name — never silently', async () => {
    const segment = { videoId: 'abc', start: 600, end: 780 }
    if (adapter.supportsVideo) {
      fetchMock.mockResolvedValue(
        jsonResponse(
          wrap(
            adapter.id,
            JSON.stringify({ candidates: [], transcript: 'what the model says it heard' }),
          ),
        ),
      )
      const r = await adapter.compose({ segment, prompt: '', key: KEY, models: adapter.defaultModels })
      expect(r.ok).toBe(true)
      // Video mode MUST return its own transcript — it is the acquired text the
      // Verifier matches against, and without it video mode has nothing to check.
      if (r.ok) expect(typeof r.transcript).toBe('string')
    } else {
      const r = await adapter.compose({ segment, prompt: '', key: KEY, models: adapter.defaultModels })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('unsupported-mode')
    }
  })
})

describe('shouldTryNextModel', () => {
  it('retries the statuses that mean try another model, and not the ones that do not', () => {
    for (const s of [404, 429, 500, 502, 503]) expect(shouldTryNextModel(s)).toBe(true)
    for (const s of [200, 400, 401, 403]) expect(shouldTryNextModel(s)).toBe(false)
  })
})
