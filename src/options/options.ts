/**
 * C4 — the options page.
 *
 * Two things here are mandated rather than chosen, and hld assigns both to
 * fe-plan by name:
 *
 *   FR-014  the training disclosure. ACKNOWLEDGED, not merely displayed.
 *           Declining leaves the extension configured and unable to compose —
 *           there is no silent proceed. The flag it sets is read by C3 on every
 *           compose, so this page cannot be walked around.
 *
 *   spec decision 5  video mode unavailable on this provider, said at the point
 *           the user would choose it rather than left to be discovered.
 *
 * The key field being empty on a new browser session is a DESIGNED STATE, not an
 * error: the credential is session-scoped by ruling, and the copy says so.
 */
import { ADAPTERS } from '../worker/adapters'
import {
  clearCredentials,
  readCredentials,
  readSettings,
  writeCredentials,
  writeSettings,
} from '../worker/config'
import { STRINGS } from '../content/strings'

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

const providerSel = $<HTMLSelectElement>('provider')
const keyInput = $<HTMLInputElement>('apiKey')
const keyHint = $<HTMLElement>('keyHint')
const segmentSel = $<HTMLSelectElement>('segment')
const modeSel = $<HTMLSelectElement>('mode')
const modeHint = $<HTMLElement>('modeHint')
const disclosure = $<HTMLElement>('disclosure')
const disclosureText = $<HTMLElement>('disclosureText')
const acceptBtn = $<HTMLButtonElement>('disclosureAccept')
const declineBtn = $<HTMLButtonElement>('disclosureDecline')
const status = $<HTMLElement>('status')

const currentAdapter = () => ADAPTERS.find((a) => a.id === providerSel.value) ?? ADAPTERS[0]

function renderModeHint(): void {
  const a = currentAdapter()
  if (!a) return
  // Told at the point of choosing — spec decision 5.
  modeHint.textContent =
    modeSel.value === 'video' && !a.supportsVideo ? STRINGS.videoUnavailable(a.label) : ''
}

async function renderDisclosure(): Promise<void> {
  const a = currentAdapter()
  const { disclosureShown } = await readSettings()
  if (!a || !a.freeTierMayTrain || disclosureShown) {
    disclosure.hidden = true
    return
  }
  disclosure.hidden = false
  disclosureText.textContent = STRINGS.trainingDisclosure(a.label)
  acceptBtn.textContent = STRINGS.trainingAccept
  declineBtn.textContent = STRINGS.trainingDecline
}

async function load(): Promise<void> {
  for (const a of ADAPTERS) {
    const o = document.createElement('option')
    o.value = a.id
    o.textContent = a.label
    providerSel.append(o)
  }

  const s = await readSettings()
  providerSel.value = s.provider
  segmentSel.value = String(s.segmentSeconds)
  modeSel.value = s.mode

  const { apiKey } = await readCredentials()
  // A designed state, not an error.
  keyHint.textContent = apiKey ? '' : STRINGS.keyReentry

  renderModeHint()
  await renderDisclosure()
}

async function save(): Promise<void> {
  await writeSettings({
    provider: providerSel.value,
    segmentSeconds: Number(segmentSel.value),
    mode: modeSel.value === 'video' ? 'video' : 'captions',
  })
  if (keyInput.value) {
    // session, never local. config.ts has no function that could do otherwise.
    await writeCredentials({ apiKey: keyInput.value })
    keyInput.value = ''
    keyHint.textContent = ''
  }
  status.textContent = 'Saved.'
}

providerSel.addEventListener('change', () => {
  renderModeHint()
  void renderDisclosure()
})
modeSel.addEventListener('change', renderModeHint)

acceptBtn.addEventListener('click', () => {
  void writeSettings({ disclosureShown: true }).then(() => {
    disclosure.hidden = true
    status.textContent = 'Acknowledged.'
  })
})

declineBtn.addEventListener('click', () => {
  // Configured, and unable to compose. No silent proceed.
  disclosure.hidden = true
  status.textContent = 'Not acknowledged — clipback will not send anything to this provider.'
})

$<HTMLButtonElement>('save').addEventListener('click', () => void save())
$<HTMLButtonElement>('clearKey').addEventListener('click', () => {
  void clearCredentials().then(() => {
    keyInput.value = ''
    keyHint.textContent = STRINGS.keyReentry
    status.textContent = 'Key cleared.'
  })
})

void load()
