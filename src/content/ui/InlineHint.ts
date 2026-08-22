/**
 * S1 — the first-run hint.
 *
 * Shown once on the first watch page after install, then never again. It says
 * the shortcut AND that capture works BACKWARDS, because "no need to rewind" is
 * the thing that makes the product make sense.
 */
import { STRINGS } from '../strings'

const SEEN = 'hintDismissed'

export class InlineHint {
  constructor(private readonly root: ParentNode & Node = document.body) {}

  async showIfFirstRun(): Promise<boolean> {
    const s = await chrome.storage.local.get([SEEN])
    if (s[SEEN] === true) return false

    const el = document.createElement('div')
    el.className = 'clipback-toast'
    el.setAttribute('role', 'note')

    const p = document.createElement('p')
    p.textContent = STRINGS.firstRunHint
    el.append(p)

    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = STRINGS.dismiss
    b.addEventListener('click', () => {
      void chrome.storage.local.set({ [SEEN]: true })
      el.remove()
    })
    el.append(b)

    this.root.appendChild(el)
    return true
  }
}
