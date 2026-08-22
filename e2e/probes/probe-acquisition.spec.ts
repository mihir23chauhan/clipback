/**
 * be-plan TASK 1 — the probe that can change the design.
 *
 * arch names one what-would-change-my-mind condition: is
 * `youtubei/v1/get_transcript` reachable from the MAIN world? Rung 2 is the
 * load-bearing rung precisely because it is INVISIBLE — it is what YouTube's own
 * transcript panel calls, and it sidesteps the PO-token wall without touching the
 * DOM.
 *
 * If it is unreachable, rung 3 becomes primary: the transcript panel must be
 * visibly opened on every new video, and uiux's onboarding disclosure stops being
 * precautionary and becomes load-bearing. That is a product change, not a bug.
 *
 * This runs against a REAL watch page. It reads a public video's own transcript
 * the way the page itself does. Nothing is sent anywhere.
 */
import { chromium, expect, test, type BrowserContext } from '@playwright/test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// A long-form English video with captions. Public.
const VIDEO_ID = process.env['CLIPBACK_PROBE_VIDEO'] ?? 'hXmdstgFxso'

let context: BrowserContext
let profile: string

test.beforeAll(async () => {
  profile = await mkdtemp(join(tmpdir(), 'clipback-probe-'))
  context = await chromium.launchPersistentContext(profile, { channel: 'chromium' })
})

test.afterAll(async () => {
  await context?.close()
  if (profile) await rm(profile, { recursive: true, force: true })
})

test('probe: which acquisition rungs are reachable from the MAIN world', async () => {
  const page = await context.newPage()
  await page.goto(`https://www.youtube.com/watch?v=${VIDEO_ID}`, {
    waitUntil: 'domcontentloaded',
    timeout: 45_000,
  })
  // ytInitialPlayerResponse is injected by an inline script; give it a moment.
  await page.waitForFunction(() => 'ytInitialPlayerResponse' in window, null, { timeout: 30_000 })

  // Everything below runs IN THE PAGE — the MAIN world, with the page's session.
  const result = await page.evaluate(async () => {
    type Probe = {
      rung1: { tracks: number; gated: boolean; status?: number; bytes?: number; error?: string }
      rung2: { paramsFound: boolean; status?: number; bytes?: number; cues?: number; variant?: string; error?: string | undefined }
      apiKeyPresent: boolean
    }
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const w = window as any
    const out: Probe = {
      rung1: { tracks: 0, gated: false },
      rung2: { paramsFound: false },
      apiKeyPresent: false,
    }

    // ── rung 1: captionTracks baseUrl + fmt=json3 ──────────────────────────
    const tracks =
      w.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []
    out.rung1.tracks = tracks.length
    if (tracks.length) {
      const url: string = tracks[0].baseUrl
      out.rung1.gated = url.includes('exp=xpe') && !url.includes('pot=')
      try {
        const r = await fetch(`${url}&fmt=json3`, { credentials: 'include' })
        out.rung1.status = r.status
        out.rung1.bytes = (await r.text()).length
      } catch (e) {
        out.rung1.error = String(e)
      }
    }

    // ── rung 2: youtubei/v1/next -> getTranscriptEndpoint -> get_transcript ──
    const key: string | undefined = w.ytcfg?.get?.('INNERTUBE_API_KEY')
    const ctx = w.ytcfg?.get?.('INNERTUBE_CONTEXT')
    out.apiKeyPresent = Boolean(key)
    if (key && ctx) {
      try {
        const nextRes = await fetch(`/youtubei/v1/next?key=${key}&prettyPrint=false`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ context: ctx, videoId: new URLSearchParams(location.search).get('v') }),
        })
        const nextJson = await nextRes.json()
        const flat = JSON.stringify(nextJson)
        const params = flat.match(/"getTranscriptEndpoint":\{"params":"([^"]+)"/)
        out.rung2.paramsFound = Boolean(params)
        if (!params) {
          // Diagnose rather than report a bare false: did `next` succeed at all?
          out.rung2.error = `next ${nextRes.status}, ${flat.length}B, hasTranscriptWord=${flat.includes('ranscript')}`
        }
        if (params?.[1]) {
          // FAILED_PRECONDITION on the naive call. Try the variants YouTube's own
          // client actually sends, and report WHICH one works rather than whether
          // one does — the answer determines what reader.ts has to construct.
          const cv: string = w.ytcfg?.get?.('INNERTUBE_CLIENT_VERSION') ?? ctx?.client?.clientVersion
          const visitor: string = w.ytcfg?.get?.('VISITOR_DATA') ?? ''
          const variants: Array<[string, RequestInit]> = [
            ['bare', { headers: { 'content-type': 'application/json' } }],
            [
              'client-headers',
              {
                headers: {
                  'content-type': 'application/json',
                  'x-youtube-client-name': '1',
                  'x-youtube-client-version': cv,
                  ...(visitor ? { 'x-goog-visitor-id': visitor } : {}),
                },
              },
            ],
            [
              'client-only-context',
              {
                headers: {
                  'content-type': 'application/json',
                  'x-youtube-client-name': '1',
                  'x-youtube-client-version': cv,
                },
                body: JSON.stringify({
                  context: { client: { clientName: 'WEB', clientVersion: cv, hl: 'en', gl: 'US' } },
                  params: params[1],
                }),
              },
            ],
          ]
          for (const [name, init] of variants) {
            const tr = await fetch(`/youtubei/v1/get_transcript?key=${key}&prettyPrint=false`, {
              method: 'POST',
              credentials: 'include',
              body: JSON.stringify({ context: ctx, params: params[1] }),
              ...init,
            })
            const text = await tr.text()
            const cues = (text.match(/"transcriptSegmentRenderer"/g) ?? []).length
            out.rung2.status = tr.status
            out.rung2.bytes = text.length
            out.rung2.cues = cues
            out.rung2.variant = name
            if (tr.ok && cues > 0) { out.rung2.error = undefined; break }
            out.rung2.error = `${name}: ${tr.status} ${text.slice(0, 120)}`
          }
        }
      } catch (e) {
        out.rung2.error = String(e)
      }
    }
    return out
  })

  await writeFile('probe-result.json', JSON.stringify(result, null, 2) + '\n')
  console.log('[probe]', JSON.stringify(result, null, 2))

  // The probe REPORTS. Its job is to make the answer visible, not to pass.
  expect(result.rung1.tracks).toBeGreaterThan(0)
  await page.close()
})
