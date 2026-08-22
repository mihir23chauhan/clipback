/**
 * fe-testplan GROUP 6 — the highest-consequence check in the product.
 *
 * S3 renders claims[].text AND dropped[].text into the DOM on youtube.com's
 * origin. Grounding constrains span, never text, so nothing upstream of this
 * makes it safe. The assertion is FINAL STATE: no element created, no request
 * made.
 */
import { describe, expect, it, vi } from 'vitest'
import { Panel } from '../src/content/ui/Panel'
import { buildNote, type Note } from '../src/worker/note'

const noteWith = (claimText: string, droppedText?: string): Note =>
  buildNote({
    videoId: 'vid1',
    start: 600,
    end: 780,
    route: 'innertube',
    mode: 'captions',
    provider: 'gemini',
    createdAt: '2026-08-22T00:00:00Z',
    claims: [{ text: claimText, span: 'a verbatim span of words' }],
    dropped: droppedText
      ? [{ text: droppedText, span: 'nope', reason: 'span-not-found' as const }]
      : [],
  })

const PAYLOADS = [
  ['an img with an inline handler', '<img src=x onerror=alert(1)>'],
  ['a markdown image', '![](http://attacker.example/pixel.png)'],
  ['a javascript link', '[click](javascript:alert(1))'],
  ['a script tag', '<script>fetch("http://attacker.example")</script>'],
  ['an iframe', '<iframe src="http://attacker.example"></iframe>'],
  ['a svg onload', '<svg onload=alert(1)>'],
] as const

describe('S3 renders model prose inertly', () => {
  it.each(PAYLOADS)('creates no element from %s in claims[]', (_l, payload) => {
    document.body.replaceChildren()
    new Panel().render(noteWith(payload), () => {})
    // No element the payload asked for exists anywhere.
    for (const tag of ['img', 'script', 'iframe', 'svg']) {
      expect(document.querySelectorAll(tag)).toHaveLength(0)
    }
    // And the payload IS present — as text, which is the correct outcome.
    expect(document.body.textContent).toContain(payload)
  })

  it.each(PAYLOADS)('creates no element from %s in dropped[] either', (_l, payload) => {
    // dropped[] matters more: it FAILED the grounding check.
    document.body.replaceChildren()
    new Panel().render(noteWith('a fine claim', payload), () => {})
    for (const tag of ['img', 'script', 'iframe', 'svg']) {
      expect(document.querySelectorAll(tag)).toHaveLength(0)
    }
  })

  it('the only anchor in the panel is the one we built', () => {
    document.body.replaceChildren()
    new Panel().render(noteWith('[evil](http://attacker.example)'), () => {})
    const links = [...document.querySelectorAll('a')]
    expect(links).toHaveLength(1)
    expect(links[0]?.getAttribute('href')).toBe('https://www.youtube.com/watch?v=vid1&t=600s')
  })

  it('shows the span, because that is what makes a claim checkable', () => {
    document.body.replaceChildren()
    new Panel().render(noteWith('a claim'), () => {})
    expect(document.querySelector('blockquote')?.textContent).toBe('a verbatim span of words')
  })

  it('labels a video-mode note as the weaker guarantee', () => {
    document.body.replaceChildren()
    new Panel().render({ ...noteWith('x'), mode: 'video' }, () => {})
    expect(document.body.textContent).toContain('self-consistency, not independent verification')
  })

  it('renders dropped as provenance, under its own heading', () => {
    document.body.replaceChildren()
    new Panel().render(noteWith('kept', 'discarded'), () => {})
    expect(document.body.textContent).toContain('Dropped (1)')
    expect(document.body.textContent).toContain('were not found in the source')
  })

  it('discard is a button that calls back — not a confirm dialog', () => {
    document.body.replaceChildren()
    const onDelete = vi.fn()
    new Panel().render(noteWith('x'), onDelete)
    document.querySelector<HTMLButtonElement>('.clipback-panel__delete')?.click()
    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})
