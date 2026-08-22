/**
 * Markdown delivery.
 *
 * ESCAPES MODEL-AUTHORED TEXT, and this is not hygiene — it closes a real hole.
 * agent-design's residual: the output schema is closed, but `claims[].text` is
 * unbounded model prose and grounding constrains `span`, never `text`. A model
 * that quotes a real span can write anything beside it, and image syntax inside
 * a claim becomes an OUTBOUND REQUEST at render time. That is the third leg of
 * the lethal trifecta arriving through delivery rather than compose.
 *
 * `dropped[].text` is escaped too, and it matters MORE, not less: it is prose
 * that FAILED the grounding check, rendered as provenance.
 */
import { sourceLink, type Note } from '../note'

/**
 * Neutralise Markdown link and image syntax in text we did not author.
 *
 * The two characters that start a link or an image are what matter; escaping
 * them is enough to make `[x](url)` and `![](url)` inert, and it leaves ordinary
 * prose readable. Angle brackets go too, since autolinks and raw HTML both use
 * them and Notion/GitHub renderers differ on raw HTML.
 */
export function escapeModelText(s: string): string {
  return s.replace(/[[\]<>]/g, (c) => `\\${c}`)
}

function timecode(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export function renderMarkdown(note: Note): string {
  const lines: string[] = []

  lines.push(`# Clip — ${timecode(note.start)} to ${timecode(note.end)}`)
  lines.push('')
  lines.push(`[Watch from ${timecode(note.start)}](${sourceLink(note)})`)
  lines.push('')

  for (const c of note.claims) {
    lines.push(`- ${escapeModelText(c.text)}`)
    lines.push(`  > ${escapeModelText(c.span)}`)
  }

  if (note.dropped.length > 0) {
    lines.push('')
    lines.push(`## Dropped (${note.dropped.length})`)
    lines.push('')
    lines.push('These were returned but their quoted words were not found in the source.')
    lines.push('')
    for (const d of note.dropped) {
      lines.push(`- ${escapeModelText(d.text)} — _span not found_`)
    }
  }

  lines.push('')
  lines.push('---')
  lines.push('')
  // The note states its own basis. `mode` is what distinguishes a claim checked
  // against an independent transcript from one checked against the model's own.
  lines.push(
    note.mode === 'captions'
      ? `Grounded against YouTube's transcript (via \`${note.route}\`), ${note.provider}.`
      : `Grounded against the model's own transcript — self-consistency, not independent verification. ${note.provider}.`,
  )

  return lines.join('\n')
}

export function filenameFor(note: Note): string {
  return `clipback-${note.videoId}-${note.start}.md`
}
