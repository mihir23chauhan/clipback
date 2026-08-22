/**
 * C4 — the options page.
 *
 * The one deployable thing repo-genesis owes: a built extension that Chrome
 * loads unpacked, whose options page stores a setting and reads it back. No
 * provider call, no credential — just proof the chain from source to a running
 * extension exists, at the moment when fixing it is cheap.
 *
 * Note which store: `segmentSeconds` is a preference and lives in `local`.
 * The credential does NOT — hld K5 puts apiKey and notion.* in
 * chrome.storage.session, and this page will write them there when be-build
 * implements it.
 */

const KEY = 'segmentSeconds'
const DEFAULT = 180

async function load(): Promise<void> {
  const stored = await chrome.storage.local.get(KEY)
  const select = document.querySelector<HTMLSelectElement>('#segment')
  if (select) select.value = String(stored[KEY] ?? DEFAULT)
}

async function save(): Promise<void> {
  const select = document.querySelector<HTMLSelectElement>('#segment')
  const status = document.querySelector<HTMLElement>('#status')
  if (!select) return
  await chrome.storage.local.set({ [KEY]: Number(select.value) })
  const readBack = await chrome.storage.local.get(KEY)
  if (status) {
    // textContent, never innerHTML — the discipline starts here even though
    // this string is ours.
    status.textContent = `Saved. Stored value reads back as ${readBack[KEY]}s.`
  }
}

document.querySelector('#save')?.addEventListener('click', () => void save())
void load()
