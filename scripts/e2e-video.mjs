/**
 * A REAL end-to-end run of the risky half, with no browser and no sign-in.
 *
 * Video mode needs no transcript from YouTube — the model reads the video and
 * returns its own transcript, which is then the acquired text the Verifier
 * matches against. So this exercises the whole spine:
 *
 *   adapter -> real provider call -> shape validation -> grounding -> note ->
 *   markdown render (with escaping)
 *
 * Costs roughly $0.015 per run, billed to the key's own account.
 * R-SECRET-FILE: the key comes from ~/.gemini-key via the environment. It is
 * never printed and never written anywhere.
 */
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const VIDEO = process.env.CLIPBACK_VIDEO ?? 'hXmdstgFxso'
const START = Number(process.env.CLIPBACK_START ?? 600)
const END = Number(process.env.CLIPBACK_END ?? 780)

// The file may be a bare key or KEY=value. Accept both; never print either.
const raw = (await readFile(join(homedir(), '.gemini-key'), 'utf8')).trim()
const key = raw.includes('=') ? raw.slice(raw.indexOf('=') + 1).trim() : raw
if (!key) throw new Error('no key in ~/.gemini-key')

// Import the SHIPPING code, not a copy of it.
const { gemini } = await import('../dist-node/adapters/gemini.js')
const { groundAgainstModelTranscript } = await import('../dist-node/grounding.js')
const { buildNote, validateAdapterReturn } = await import('../dist-node/note.js')
const { renderMarkdown } = await import('../dist-node/delivery/markdown.js')

console.log(`compose: ${VIDEO} ${START}s..${END}s, video mode, model walk = ${gemini.defaultModels.join(' -> ')}`)

const t0 = Date.now()
const result = await gemini.compose({
  segment: { videoId: VIDEO, start: START, end: END },
  prompt: '',
  key,
  models: gemini.defaultModels,
})
const elapsed = ((Date.now() - t0) / 1000).toFixed(1)

if (!result.ok) {
  console.log(`FAILED after ${elapsed}s — reason: ${result.reason}`)
  console.log(`detail: ${result.detail}`)
  process.exit(1)
}

console.log(`answered by ${result.model} in ${elapsed}s`)
console.log(`candidates: ${result.candidates.length}`)
console.log(`transcript: ${result.transcript ? `${result.transcript.length} chars` : 'ABSENT — video mode has nothing to ground against'}`)

const shape = validateAdapterReturn(result)
console.log(`shape: ${shape.ok ? 'valid' : `bad-shape (${shape.detail})`}`)
if (!shape.ok) process.exit(1)

const grounded = groundAgainstModelTranscript(result.candidates, result.transcript ?? '')
console.log(`grounded: ${grounded.claims.length} claims kept, ${grounded.dropped.length} dropped`)

if (grounded.claims.length === 0) {
  console.log('UNGROUNDED — FR-006a says no note is written. That is a correct outcome, not a crash.')
  for (const d of grounded.dropped) console.log(`  dropped: ${JSON.stringify(d.span).slice(0, 90)}`)
  process.exit(0)
}

const note = buildNote({
  videoId: VIDEO,
  start: START,
  end: END,
  route: 'innertube',
  mode: 'video',
  provider: gemini.id,
  createdAt: new Date().toISOString(),
  claims: grounded.claims,
  dropped: grounded.dropped,
})

console.log('\n--- the note, as delivered ---\n')
console.log(renderMarkdown(note))
