// Reads the two probe result files and prints the ladder verdict.
// be-plan task 1 — arch's what-would-change-my-mind condition.
import { readFile } from 'node:fs/promises'

const r1 = JSON.parse(await readFile('probe-result.json', 'utf8'))
const r3 = JSON.parse(await readFile('probe-rung3-result.json', 'utf8'))

console.log('ACQUISITION LADDER PROBE — signed-out Chromium, real watch page')
console.log('video:', process.env.CLIPBACK_PROBE_VIDEO ?? 'hXmdstgFxso')
console.log('')
console.log('rung 1  captionTracks + fmt=json3')
console.log(`  tracks=${r1.rung1.tracks} gated(exp=xpe,no pot)=${r1.rung1.gated} status=${r1.rung1.status} bytes=${r1.rung1.bytes}`)
console.log(`  VERDICT: ${r1.rung1.bytes > 0 ? 'USABLE' : 'WALLED — 200 with an empty body'}`)
console.log('')
console.log('rung 2  youtubei/v1/next -> get_transcript')
console.log(`  paramsFound=${r1.rung2.paramsFound} status=${r1.rung2.status} lastVariant=${r1.rung2.variant}`)
console.log(`  VERDICT: ${r1.rung2.cues > 0 ? 'USABLE' : 'WALLED — params resolve, endpoint returns FAILED_PRECONDITION'}`)
console.log('')
console.log('rung 3  transcript panel scrape')
console.log(`  showTranscriptButtonFound=${r3.showTranscriptButtonFound} segments=${r3.segmentCount}`)
console.log(`  VERDICT: ${r3.segmentCount > 0 ? 'USABLE' : 'NO CONTROL FOUND'}`)
console.log('')
console.log('CONFOUND: this ran SIGNED OUT (LOGGED_IN=false). arch states rungs 1')
console.log('and 2 use the page authenticated session. The result is conclusive for')
console.log('signed-out and INCONCLUSIVE for the environment the product ships into.')
