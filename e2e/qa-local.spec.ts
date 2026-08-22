/**
 * int-testplan, the parts executable without a signed-in session or a paid call.
 *
 * What this CANNOT do, and why it is not silently skipped:
 *   - the end-to-end path needs a real provider call, billed to the user's own
 *     account, and R-EXPENSIVE-CMD forbids running one on our own initiative;
 *   - the acquisition rungs need a signed-in session, which is the user's.
 * Both are named in this stage's evidence and remain owed at local-qa-gate.
 */
import { chromium, expect, test, type BrowserContext } from '@playwright/test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const DIST = resolve(process.cwd(), 'dist')
let context: BrowserContext
let profile: string

test.beforeAll(async () => {
  profile = await mkdtemp(join(tmpdir(), 'clipback-qa-'))
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  })
})
test.afterAll(async () => {
  await context?.close()
  if (profile) await rm(profile, { recursive: true, force: true })
})

const workerOf = async () =>
  context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))

test('precondition 1: the build produced a loadable MV3 dist', async () => {
  const m = JSON.parse(await readFile(join(DIST, 'manifest.json'), 'utf8'))
  expect(m.manifest_version).toBe(3)
  const main = m.content_scripts.find((c: { world?: string }) => c.world === 'MAIN')
  // Without this the acquisition rungs fail in a way that looks like YouTube changing.
  expect(main, 'a MAIN-world content script must be declared').toBeTruthy()
})

test('precondition 3: the service worker registers — it holds no port, so this is the alive check', async () => {
  const w = await workerOf()
  expect(w.url()).toContain('worker.js')
})

test('N6: every declared host is https, and none is a clipback server', async () => {
  const m = JSON.parse(await readFile(join(DIST, 'manifest.json'), 'utf8'))
  const hosts: string[] = m.host_permissions
  for (const h of hosts) expect(h.startsWith('https://')).toBe(true)
  // The no-backend property: nothing we operate is in the list.
  expect(hosts.join(' ')).not.toMatch(/clipback\.(com|io|app|dev)/)
  expect(hosts).toHaveLength(4) // youtube + three providers
})

test('N1: the built bundle contains no key-shaped literal', async () => {
  for (const f of ['worker.js', 'content.js', 'main-world.js', 'options.js']) {
    const src = await readFile(join(DIST, f), 'utf8')
    expect(src, `${f} must not embed a credential`).not.toMatch(/AIza[0-9A-Za-z_-]{30,}/)
    expect(src).not.toMatch(/sk-[A-Za-z0-9]{20,}/)
  }
})

test('F10: compose refuses before any network call when the disclosure is unacknowledged', async () => {
  const w = await workerOf()
  const requests: string[] = []
  context.on('request', (r) => requests.push(r.url()))

  // sendMessage from the worker does not reach the worker's own listener, so
  // drive it from an extension page — which is the path C2 actually uses.
  const extensionId = new URL(w.url()).host
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)

  const reply = await page.evaluate(async () => {
    await chrome.storage.local.set({ provider: 'gemini', disclosureShown: false })
    await chrome.storage.session.set({ apiKey: 'not-a-real-key' })
    return chrome.runtime.sendMessage({
      v: 1,
      kind: 'compose',
      payload: {
        videoId: 'vid',
        start: 0,
        end: 180,
        route: 'dom',
        mode: 'captions',
        cues: [{ t: 0, d: 5, text: 'some words that were said aloud' }],
      },
    })
  })
  await page.close()

  expect((reply as { ok: boolean; reason?: string }).ok).toBe(false)
  expect((reply as { reason?: string }).reason).toBe('disclosure-required')
  // And it spent nothing doing it.
  expect(requests.filter((u) => u.includes('generativelanguage'))).toHaveLength(0)
})

test('the options page persists settings and never writes a credential to local', async () => {
  const w = await workerOf()
  const extensionId = new URL(w.url()).host
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)

  await page.selectOption('#segment', '300')
  await page.fill('#apiKey', 'test-key-value-not-real')
  await page.click('#save')
  await expect(page.locator('#status')).toHaveText(/Saved/)

  const stores = await page.evaluate(async () => ({
    local: await chrome.storage.local.get(null),
    session: await chrome.storage.session.get(null),
  }))

  // T6 / spec decision 2: the credential is session-scoped. This is the check
  // that a one-word diff would otherwise break silently.
  expect(JSON.stringify(stores.local)).not.toContain('test-key-value-not-real')
  expect(JSON.stringify(stores.session)).toContain('test-key-value-not-real')
  expect(stores.local['segmentSeconds']).toBe(300)

  await page.close()
})

test('the training disclosure is presented and is acknowledgeable', async () => {
  const w = await workerOf()
  const extensionId = new URL(w.url()).host
  const page = await context.newPage()
  await page.evaluate(() => undefined)
  await page.goto(`chrome-extension://${extensionId}/options.html`)

  await page.evaluate(async () => {
    await chrome.storage.local.set({ provider: 'gemini', disclosureShown: false })
  })
  await page.reload()

  const box = page.locator('#disclosure')
  await expect(box).toBeVisible()
  await expect(box).toContainText('may use what you send')
  // Named, not vague.
  await expect(box).toContainText('Gemini')
  await page.close()
})
