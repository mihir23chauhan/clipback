/**
 * Notion delivery — milestone 1c.
 *
 * Notion is a BLOCK MODEL, so escaping happens by CONSTRUCTING rich_text nodes
 * rather than by escaping a string. Model prose goes into a text node's
 * `content` field, where it is data and never markup. That is a different
 * mechanism from Markdown's, for the same reason, and hld K6 says so explicitly.
 */
import { sourceLink, type Note } from '../note'

const ENDPOINT = 'https://api.notion.com/v1/pages'
const VERSION = '2022-06-28'

/** A text node. Model prose lands in `content` and cannot become markup. */
const text = (content: string): Record<string, unknown> => ({
  type: 'text',
  text: { content: content.slice(0, 2000) },
})

const paragraph = (rich: Record<string, unknown>[]): Record<string, unknown> => ({
  object: 'block',
  type: 'paragraph',
  paragraph: { rich_text: rich },
})

const quote = (content: string): Record<string, unknown> => ({
  object: 'block',
  type: 'quote',
  quote: { rich_text: [text(content)] },
})

const heading = (content: string): Record<string, unknown> => ({
  object: 'block',
  type: 'heading_2',
  heading_2: { rich_text: [text(content)] },
})

export function blocksFor(note: Note): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = []

  blocks.push(
    paragraph([
      { type: 'text', text: { content: 'Source', link: { url: sourceLink(note) } } },
    ]),
  )

  for (const c of note.claims) {
    blocks.push(paragraph([text(c.text)]))
    blocks.push(quote(c.span))
  }

  if (note.dropped.length > 0) {
    blocks.push(heading(`Dropped (${note.dropped.length})`))
    for (const d of note.dropped) {
      blocks.push(paragraph([text(`${d.text} — span not found`)]))
    }
  }

  blocks.push(
    paragraph([
      text(
        note.mode === 'captions'
          ? `Grounded against YouTube's transcript (via ${note.route}), ${note.provider}.`
          : `Grounded against the model's own transcript — self-consistency, not independent verification. ${note.provider}.`,
      ),
    ]),
  )

  return blocks
}

export interface NotionResult {
  ok: boolean
  detail: string
}

export async function deliverToNotion(
  note: Note,
  token: string,
  databaseId: string,
): Promise<NotionResult> {
  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        'Notion-Version': VERSION,
      },
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties: {
          // The title is ours, not the model's.
          Name: { title: [text(`Clip — ${note.videoId} @ ${note.start}s`)] },
        },
        children: blocksFor(note),
      }),
    })
  } catch (e) {
    return { ok: false, detail: `could not reach Notion: ${String(e)}` }
  }
  if (!res.ok) return { ok: false, detail: `Notion returned ${res.status}` }
  return { ok: true, detail: 'delivered' }
}
