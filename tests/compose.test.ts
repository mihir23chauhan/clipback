import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stubChrome } from './helpers/chrome'
import type { Cue } from '../src/worker/grounding'

const cues: Cue[] = [
  { t: 600, d: 5, text: 'he said the film Baazigar has a famous line about losing' },
]
const GOOD = JSON.stringify({
  candidates: [
    { text: 'Baazigar has a famous line', span: 'the film Baazigar has a famous line about losing' },
  ],
})
const geminiBody = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] })

const jsonResponse = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })

const req = {
  videoId: 'vid1',
  start: 600,
  end: 780,
  route: 'innertube' as const,
  mode: 'captions' as const,
  cues,
}

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

const load = async () => (await import('../src/worker/compose')).compose

describe('compose — the trust boundary', () => {
  it('produces a note when a span matches', async () => {
    stubChrome({ provider: 'gemini', disclosureShown: true }, { apiKey: 'k' })
    fetchMock.mockResolvedValue(jsonResponse(geminiBody(GOOD)))
    const r = await (await load())(req, () => '2026-08-22T00:00:00Z')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.note.claims).toHaveLength(1)
      expect(r.note.mode).toBe('captions')
      expect(r.note.route).toBe('innertube')
    }
  })

  it('writes NO note when nothing grounds — FR-006a', async () => {
    stubChrome({ provider: 'gemini', disclosureShown: true }, { apiKey: 'k' })
    fetchMock.mockResolvedValue(
      jsonResponse(
        geminiBody(
          JSON.stringify({ candidates: [{ text: 'He endorsed it', span: 'he endorsed the product' }] }),
        ),
      ),
    )
    const r = await (await load())(req)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('ungrounded')
  })

  it('an empty span cannot smuggle a claim through — the vacuity case', async () => {
    stubChrome({ provider: 'gemini', disclosureShown: true }, { apiKey: 'k' })
    fetchMock.mockResolvedValue(
      jsonResponse(geminiBody(JSON.stringify({ candidates: [{ text: 'Anything', span: '' }] }))),
    )
    const r = await (await load())(req)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('ungrounded')
  })

  it('a wrong shape is a failed compose, not a partial one', async () => {
    stubChrome({ provider: 'gemini', disclosureShown: true }, { apiKey: 'k' })
    fetchMock.mockResolvedValue(jsonResponse(geminiBody(JSON.stringify({ summary: 'nice' }))))
    const r = await (await load())(req)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('bad-shape')
  })
})

describe('compose — the gates that run BEFORE any provider call', () => {
  it('F10: refuses when the training disclosure is unacknowledged, and does not call out', async () => {
    // The check lives in the worker, not the options page — one the user cannot
    // walk around.
    stubChrome({ provider: 'gemini', disclosureShown: false }, { apiKey: 'k' })
    const r = await (await load())(req)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('disclosure-required')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses with no key, and does not call out', async () => {
    stubChrome({ provider: 'gemini', disclosureShown: true }, {})
    const r = await (await load())(req)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('no-key')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('names the provider when video mode is unavailable there — told, not discovered', async () => {
    stubChrome({ provider: 'openai', disclosureShown: true }, { apiKey: 'k' })
    const r = await (await load())({ ...req, mode: 'video' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toBe('no-video-support')
      expect(r.provider).toBe('OpenAI')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('compose — video mode grounds against the model transcript', () => {
  it('uses the returned transcript as the acquired text, and records mode', async () => {
    stubChrome({ provider: 'gemini', disclosureShown: true }, { apiKey: 'k' })
    fetchMock.mockResolvedValue(
      jsonResponse(
        geminiBody(
          JSON.stringify({
            candidates: [{ text: 'A point', span: 'this is what the model heard here' }],
            transcript: 'well this is what the model heard here today',
          }),
        ),
      ),
    )
    const r = await (await load())({ ...req, mode: 'video', cues: [] })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.note.mode).toBe('video')
      expect(r.note.claims).toHaveLength(1)
    }
  })

  it('is NOT exempt from grounding — a span absent from its own transcript is dropped', async () => {
    stubChrome({ provider: 'gemini', disclosureShown: true }, { apiKey: 'k' })
    fetchMock.mockResolvedValue(
      jsonResponse(
        geminiBody(
          JSON.stringify({
            candidates: [{ text: 'Invented', span: 'words it never claimed to hear' }],
            transcript: 'something else entirely was said',
          }),
        ),
      ),
    )
    const r = await (await load())({ ...req, mode: 'video', cues: [] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('ungrounded')
  })
})
