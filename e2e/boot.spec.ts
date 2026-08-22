import { chromium, expect, test, type BrowserContext } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const DIST = resolve(process.cwd(), 'dist')

let context: BrowserContext
let profile: string

test.beforeAll(async () => {
  profile = await mkdtemp(join(tmpdir(), 'clipback-e2e-'))
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  })
})

test.afterAll(async () => {
  await context?.close()
  if (profile) await rm(profile, { recursive: true, force: true })
})

test('the extension registers a service worker', async () => {
  // MV3 workers start lazily, so wait rather than assume.
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  expect(worker.url()).toContain('worker.js')
})

test('the options page stores a setting and reads it back', async () => {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  const extensionId = new URL(worker.url()).host

  const page = await context.newPage()
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })

  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await page.selectOption('#segment', '300')
  await page.click('#save')
  await expect(page.locator('#status')).toHaveText(/Saved/)

  // Assert PERSISTENCE, not a status string: reload and check the value came
  // back. A status message can be right while nothing was stored.
  await page.reload()
  await expect(page.locator('#segment')).toHaveValue('300')

  expect(errors, `console errors on the options page: ${errors.join(' | ')}`).toEqual([])
  await page.close()
})
