/**
 * be-plan task 1, continued: rung 3 — the DOM panel scrape.
 *
 * Last in the ladder because the panel's target-id changed twice in eight weeks
 * during 2026, and because it is the only VISIBLE rung: transcript segments exist
 * in the DOM only while the panel is rendered, so open-then-hide is not available.
 *
 * This matters only if rungs 1 and 2 are walled. Which, per probe-acquisition,
 * they are.
 */
import { chromium, expect, test, type BrowserContext } from '@playwright/test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const VIDEO_ID = process.env['CLIPBACK_PROBE_VIDEO'] ?? 'hXmdstgFxso'

let context: BrowserContext
let profile: string

test.beforeAll(async () => {
  profile = await mkdtemp(join(tmpdir(), 'clipback-rung3-'))
  context = await chromium.launchPersistentContext(profile, { channel: 'chromium' })
})

test.afterAll(async () => {
  await context?.close()
  if (profile) await rm(profile, { recursive: true, force: true })
})

test('probe: can the transcript panel be opened and scraped', async () => {
  const page = await context.newPage()
  await page.goto(`https://www.youtube.com/watch?v=${VIDEO_ID}`, {
    waitUntil: 'domcontentloaded',
    timeout: 45_000,
  })

  const out: Record<string, unknown> = {}

  // Consent / cookie interstitials are the most privacy-preserving option only if
  // one appears; we decline rather than accept, and record that we saw one.
  const reject = page.locator('button:has-text("Reject all"), button:has-text("Reject")')
  out['consentSeen'] = (await reject.count()) > 0
  if (await reject.count()) await reject.first().click({ timeout: 5_000 }).catch(() => {})

  // The panel is opened from "...more" in the description on current YouTube.
  const expand = page.locator('#expand, tp-yt-paper-button#expand').first()
  if (await expand.count()) await expand.click({ timeout: 10_000 }).catch(() => {})

  const showTranscript = page.getByRole('button', { name: /show transcript/i }).first()
  out['showTranscriptButtonFound'] = (await showTranscript.count()) > 0
  if (await showTranscript.count()) {
    await showTranscript.click({ timeout: 10_000 }).catch(() => {})
  }

  const segments = page.locator('ytd-transcript-segment-renderer')
  await segments.first().waitFor({ timeout: 20_000 }).catch(() => {})
  const n = await segments.count()
  out['segmentCount'] = n

  if (n > 0) {
    out['sample'] = await segments.nth(0).innerText()
    out['sampleMid'] = await segments.nth(Math.floor(n / 2)).innerText()
  }

  await writeFile('probe-rung3-result.json', JSON.stringify(out, null, 2) + '\n')
  console.log('[rung3]', JSON.stringify(out, null, 2))

  expect(out['showTranscriptButtonFound'] ?? false).toBeDefined()
  await page.close()
})
