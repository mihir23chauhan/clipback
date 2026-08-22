/**
 * S3 — the note preview.
 *
 * THE HIGHEST-CONSEQUENCE FILE IN THE PRODUCT.
 *
 * It renders `claims[].text` AND `dropped[].text` — unbounded model prose, and
 * `dropped[]` is prose that FAILED the grounding check — into the DOM on
 * youtube.com's origin. Grounding does not help here: it constrains `span`,
 * never `text`.
 *
 * So every string from the model goes in via `textContent`, and nothing in this
 * file constructs markup from it. ESLint makes `innerHTML` a hard error; if you
 * find yourself wanting to disable that rule, the design is wrong.
 *
 * v1 notes are NOT editable in-page. Editing would break the span-to-claim
 * binding that grounding depends on — uiux S3 read-only, and the reason.
 */
import type { Note } from '../../worker/note'
import { STRINGS } from '../strings'

const text = (tag: string, content: string, className?: string): HTMLElement => {
  const el = document.createElement(tag)
  // The single rule this file exists to hold.
  el.textContent = content
  if (className) el.className = className
  return el
}

export class Panel {
  private el: HTMLElement | null = null

  constructor(private readonly root: ParentNode & Node = document.body) {}

  render(note: Note, onDelete: () => void): HTMLElement {
    const el = this.el ?? this.create()
    el.replaceChildren()

    el.append(text('h2', `Clip — ${note.claims.length} claims`, 'clipback-panel__title'))

    // Our own link, built by us, never from model text.
    const link = document.createElement('a')
    link.href = `https://www.youtube.com/watch?v=${note.videoId}&t=${note.start}s`
    link.textContent = 'Open at this moment'
    link.className = 'clipback-panel__link'
    el.append(link)

    const list = document.createElement('ul')
    list.className = 'clipback-panel__claims'
    for (const c of note.claims) {
      const li = document.createElement('li')
      li.append(text('p', c.text, 'clipback-panel__claim'))
      // The span is what makes the claim checkable; showing it is the product.
      li.append(text('blockquote', c.span, 'clipback-panel__span'))
      list.append(li)
    }
    el.append(list)

    if (note.dropped.length > 0) {
      el.append(text('h3', `Dropped (${note.dropped.length})`, 'clipback-panel__dropped-title'))
      el.append(
        text(
          'p',
          'These were returned but their quoted words were not found in the source.',
          'clipback-panel__dropped-note',
        ),
      )
      const dl = document.createElement('ul')
      dl.className = 'clipback-panel__dropped'
      for (const d of note.dropped) {
        // Provenance, never content — and escaped by the same rule.
        dl.append(text('li', d.text))
      }
      el.append(dl)
    }

    el.append(
      text(
        'p',
        note.mode === 'captions'
          ? `Grounded against YouTube's transcript (via ${note.route}).`
          : "Grounded against the model's own transcript — self-consistency, not independent verification.",
        'clipback-panel__basis',
      ),
    )

    const del = document.createElement('button')
    del.type = 'button'
    del.textContent = STRINGS.discard
    del.className = 'clipback-panel__delete'
    del.addEventListener('click', onDelete)
    el.append(del)

    return el
  }

  close(): void {
    this.el?.remove()
    this.el = null
  }

  private create(): HTMLElement {
    const el = document.createElement('aside')
    el.className = 'clipback-panel'
    el.setAttribute('aria-label', 'clipback note preview')
    this.root.appendChild(el)
    this.el = el
    return el
  }
}
