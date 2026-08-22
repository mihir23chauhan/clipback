/**
 * C2 — the isolated content script.
 *
 * A widget injected into a hostile document. It owns the keystroke, issues the
 * K1 nonce, arms its own deadlines, and holds the note.
 *
 * THE CREDENTIAL NEVER REACHES THIS CONTEXT. It lives in C3, read from
 * chrome.storage.session. C4 writes it; C2 has no reason to know it exists.
 */
import { captureBoundsSeconds } from './capture'
import { Session } from './session'
import { InlineHint } from './ui/InlineHint'
import { Panel } from './ui/Panel'
import { Toast, TOAST } from './ui/Toast'
import { TIMERS } from './strings'
import { isK1ReplyFor, newNonce, type K1Reply } from '../main-world/bridge'
import type { Note } from '../worker/note'
import type { Cue } from '../worker/grounding'

const UNDO_MS = 10_000

const session = new Session()
const toast = new Toast()
const panel = new Panel()

function videoId(): string | null {
  return new URLSearchParams(location.search).get('v')
}

function player(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>('video.html5-main-video, video')
}

/** K1 — ask C1 for the transcript, and reject any reply we did not ask for. */
function requestTranscript(id: string, timeoutMs: number): Promise<K1Reply | null> {
  const nonce = newNonce()
  return new Promise((resolve) => {
    const done = (v: K1Reply | null): void => {
      window.removeEventListener('message', onMessage)
      clearTimeout(timer)
      resolve(v)
    }
    const onMessage = (e: MessageEvent): void => {
      // Same-window only, and only a reply carrying the nonce WE issued.
      if (e.source !== window) return
      if (!isK1ReplyFor(e.data, nonce, id)) return
      done(e.data)
    }
    const timer = setTimeout(() => done(null), timeoutMs)
    window.addEventListener('message', onMessage)
    window.postMessage({ v: 1, nonce, kind: 'acquire', videoId: id }, location.origin)
  })
}

async function callWorker<T>(kind: 'compose' | 'deliver', payload: unknown): Promise<T> {
  return chrome.runtime.sendMessage({ v: 1, kind, payload }) as Promise<T>
}

/**
 * PESSIMISTIC. "Note saved." appears only after delivery confirms — never after
 * compose returns. An optimistic toast on a note that then fails would assert
 * exactly the thing this product exists not to assert.
 */
async function deliverAndReport(note: Note): Promise<void> {
  const r = await callWorker<{ delivered: string[]; failed: Array<{ reason: string }> }>(
    'deliver',
    { note, targets: ['markdown'] },
  )
  if (r.delivered.length === 0) {
    toast.show({
      message: r.failed[0]?.reason ?? 'Delivery failed. Your clip is kept.',
      tone: 'neutral',
      actions: [{ label: 'Retry', onClick: () => void deliverAndReport(note) }],
    })
    return
  }
  const open = (): void => {
    panel.render(note, () => {
      const undo = session.discardWithUndo(UNDO_MS, () => panel.close())
      toast.show({
        message: 'Note discarded.',
        tone: 'neutral',
        actions: [{ label: 'Undo', onClick: undo }],
      })
    })
  }
  toast.show(
    note.dropped.length > 0
      ? TOAST.partial(note.dropped.length, open, open)
      : TOAST.saved(open),
  )
}

async function capture(mode: 'captions' | 'video' = 'captions'): Promise<void> {
  const id = videoId()
  const v = player()
  if (!id || !v) {
    toast.show(TOAST.unreadablePage())
    return
  }
  if (!navigator.onLine) {
    toast.show(TOAST.offline())
    return
  }

  toast.reset()

  const { segmentSeconds } = await chrome.storage.local
    .get(['segmentSeconds'])
    .then((s) => ({ segmentSeconds: Number(s['segmentSeconds']) || 180 }))

  // R-VALUE-BOUNDARY: the ONE conversion, here, rounding down.
  const bounds = captureBoundsSeconds(v.currentTime, segmentSeconds)
  session.hold({ videoId: id, ...bounds, mode })

  toast.show(TOAST.capturing(mode, segmentSeconds))
  await run(mode)
}

async function run(mode: 'captions' | 'video'): Promise<void> {
  const seg = session.withMode(mode)
  if (!seg) return

  const t = mode === 'video' ? TIMERS.video : TIMERS.captions

  let cues: Cue[] = []
  let route: 'baseurl' | 'innertube' | 'dom' = 'innertube'

  if (mode === 'captions') {
    const reply = await requestTranscript(seg.videoId, t.timeout)
    if (!reply) {
      toast.show(TOAST.timedOut(mode, 'YouTube', () => void run('captions'), () => void run(mode)))
      return
    }
    if (!reply.ok) {
      // Four reasons, each with its own outcome — never one string.
      if (reply.reason === 'rate-limited') toast.show(TOAST.rateLimited(() => void run(mode)))
      else if (reply.reason === 'restricted') toast.show(TOAST.restricted(() => toast.dismiss()))
      else
        toast.show(
          TOAST.noTranscript(
            () => void run('video'),
            () => toast.dismiss(),
          ),
        )
      return
    }
    cues = reply.cues
    route = reply.route
  }

  // A client deadline is MANDATORY: MV3 kills the worker, and a request with no
  // deadline in a terminable context produces silence — no note, no error.
  const slow = setTimeout(
    () => toast.show({ ...TOAST.slow(mode, 'your provider', () => toast.dismiss()) }),
    t.slow,
  )
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), t.timeout))

  const reply = await Promise.race([
    callWorker<{ ok: boolean; note?: Note; reason?: string; detail?: string; provider?: string }>(
      'compose',
      { ...seg, route, cues },
    ),
    timeout,
  ])
  clearTimeout(slow)

  if (!reply) {
    toast.show(
      TOAST.timedOut(mode, 'your provider', () => void run('captions'), () => void run(mode)),
    )
    return
  }

  if (!reply.ok || !reply.note) {
    const p = reply.provider ?? 'your provider'
    if (reply.reason === 'ungrounded') {
      toast.show(
        TOAST.ungrounded(
          () => void run('video'),
          () => toast.dismiss(),
        ),
      )
    } else if (reply.reason === 'no-key') {
      toast.show(TOAST.noKey(() => void chrome.runtime.openOptionsPage()))
    } else if (reply.reason === 'disclosure-required') {
      toast.show(TOAST.disclosureRequired(p, () => void chrome.runtime.openOptionsPage()))
    } else if (reply.reason === 'no-video-support') {
      toast.show(TOAST.videoUnavailable(p, () => void run('captions')))
    } else {
      toast.show({ message: reply.detail ?? 'Something went wrong. Your clip is kept.', tone: 'neutral' })
    }
    return
  }

  session.holdNote(reply.note)
  await deliverAndReport(reply.note)
}

function onKey(e: KeyboardEvent): void {
  const target = e.target as HTMLElement | null
  if (target?.isContentEditable || /INPUT|TEXTAREA/.test(target?.tagName ?? '')) return
  if (e.altKey && (e.key === 'c' || e.key === 'C')) {
    e.preventDefault()
    void capture()
  }
}

document.addEventListener('keydown', onKey, true)
void new InlineHint().showIfFirstRun()

console.log(JSON.stringify({ at: 'content', event: 'injected' }))

export { capture, requestTranscript }
