/**
 * K6 — the delivery handler.
 *
 * A SEPARATE round trip from compose, and the reason is F8: a delivery failure
 * must never discard a composed note. K2's reply hands the note to C2, which
 * lives as long as the page; C3 does not. C2 holds it and can re-request
 * delivery across as many worker deaths as it takes.
 *
 * Targets fail INDEPENDENTLY. Notion being unreachable does not stop the
 * Markdown file being written, and the user already spent tokens on that note.
 */
import { readCredentials } from './config'
import { filenameFor, renderMarkdown } from './delivery/markdown'
import { deliverToNotion } from './delivery/notion'
import type { Note } from './note'

export type Target = 'markdown' | 'notion'

export interface DeliverRequest {
  note: Note
  targets: Target[]
}

export interface DeliverResponse {
  delivered: Target[]
  failed: Array<{ target: Target; reason: string }>
}

async function deliverMarkdown(note: Note): Promise<void> {
  const blob = new Blob([renderMarkdown(note)], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  try {
    await chrome.downloads.download({ url, filename: filenameFor(note), saveAs: false })
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function deliver(req: DeliverRequest): Promise<DeliverResponse> {
  const delivered: Target[] = []
  const failed: DeliverResponse['failed'] = []

  for (const target of req.targets) {
    try {
      if (target === 'markdown') {
        await deliverMarkdown(req.note)
        delivered.push('markdown')
        continue
      }

      const { notionToken, notionDatabaseId } = await readCredentials()
      if (!notionToken || !notionDatabaseId) {
        failed.push({ target, reason: 'Notion is not configured' })
        continue
      }
      const r = await deliverToNotion(req.note, notionToken, notionDatabaseId)
      if (r.ok) delivered.push('notion')
      else failed.push({ target, reason: r.detail })
    } catch (e) {
      // One target throwing must not take the others down with it.
      failed.push({ target, reason: String(e) })
    }
  }

  return { delivered, failed }
}
