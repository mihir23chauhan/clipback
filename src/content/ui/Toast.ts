/**
 * S2 — the progress / result toast.
 *
 * A state machine, not a component. Seventeen reachable states, capped at THREE
 * VISIBLE per capture: uiux says more is flicker, not feedback.
 *
 * Three things this must never grow, each rejected with a reason at design-gate
 * and each the natural thing to write:
 *
 *   NO percent-done bar      an honest percentage cannot be computed here, and a
 *                            fabricated one is precisely the failure this
 *                            product exists to avoid.
 *   NO elapsed-time counter  counting up directs attention at the passage of
 *                            time, which is the one thing that reliably
 *                            lengthens a wait.
 *   NO danger styling on `ungrounded`  failing to ground a segment is a CORRECT
 *                            outcome. It uses --neutral, and
 *                            check-adherence.sh rule 7 tests that mechanically.
 */
import { STRINGS } from '../strings'

export type ToastTone = 'working' | 'grounded' | 'partial' | 'ungrounded' | 'neutral'

export interface ToastAction {
  label: string
  onClick: () => void
  /** Rendered quieter. `Stop` is demoted this way. */
  secondary?: boolean
  /** A line under the button, e.g. "this attempt may still be billed". */
  note?: string
}

export interface ToastState {
  message: string
  sub?: string
  tone: ToastTone
  actions?: ToastAction[]
  spinner?: boolean
}

const TONE_CLASS: Record<ToastTone, string> = {
  working: 'clipback-toast',
  grounded: 'clipback-toast clipback-toast--grounded',
  partial: 'clipback-toast clipback-toast--partial',
  // NOT a danger class. This is the ruling adherence rule 7 encodes.
  ungrounded: 'clipback-toast clipback-toast--ungrounded',
  neutral: 'clipback-toast clipback-toast--ungrounded',
}

export class Toast {
  private el: HTMLElement | null = null
  private transitions = 0

  constructor(private readonly root: ParentNode & Node = document.body) {}

  /** How many visible states this capture has shown. uiux caps it at 3. */
  get visibleStates(): number {
    return this.transitions
  }

  show(state: ToastState): void {
    this.transitions += 1
    const el = this.el ?? this.create()
    el.className = TONE_CLASS[state.tone]
    el.replaceChildren()

    const msg = document.createElement('p')
    msg.className = 'clipback-toast__msg'
    // textContent, never innerHTML. This string is ours, but the discipline
    // starts here so nothing downstream has to remember it.
    msg.textContent = state.message
    el.append(msg)

    if (state.sub) {
      const sub = document.createElement('p')
      sub.className = 'clipback-toast__sub'
      sub.textContent = state.sub
      el.append(sub)
    }

    if (state.actions?.length) {
      const row = document.createElement('div')
      row.className = 'clipback-toast__actions'
      for (const a of state.actions) {
        const b = document.createElement('button')
        b.type = 'button'
        b.textContent = a.label
        if (a.secondary) b.classList.add('clipback-toast__ghost')
        b.addEventListener('click', a.onClick)
        row.append(b)
        if (a.note) {
          const n = document.createElement('span')
          n.className = 'clipback-toast__note'
          n.textContent = a.note
          row.append(n)
        }
      }
      el.append(row)
    }
  }

  dismiss(): void {
    this.el?.remove()
    this.el = null
  }

  /** A new capture resets the visible-state budget. */
  reset(): void {
    this.transitions = 0
  }

  private create(): HTMLElement {
    const el = document.createElement('div')
    el.setAttribute('role', 'status')
    el.setAttribute('aria-live', 'polite')
    this.root.appendChild(el)
    this.el = el
    return el
  }
}

/** The state factory. Kept separate from the DOM so it is testable on its own. */
export const TOAST = {
  capturing: (mode: 'captions' | 'video', segmentSeconds: number): ToastState => ({
    message:
      mode === 'video'
        ? STRINGS.capturingVideo(segmentSeconds)
        : STRINGS.capturingCaptions(segmentSeconds),
    tone: 'working',
    spinner: true,
  }),

  slow: (mode: 'captions' | 'video', provider: string, onDismiss: () => void): ToastState => ({
    message: mode === 'video' ? STRINGS.slowVideo(provider) : STRINGS.slowCaptions,
    tone: 'working',
    spinner: true,
    actions: [{ label: STRINGS.dismiss, onClick: onDismiss, secondary: true }],
  }),

  downgradeOffer: (onUseCaptions: () => void, onDismiss: () => void): ToastState => ({
    message: STRINGS.downgradeOffer,
    tone: 'working',
    actions: [
      { label: STRINGS.useCaptionsInstead, onClick: onUseCaptions },
      { label: STRINGS.dismiss, onClick: onDismiss, secondary: true },
    ],
  }),

  timedOut: (
    mode: 'captions' | 'video',
    provider: string,
    onCaptions: () => void,
    onRetry: () => void,
  ): ToastState => ({
    message: mode === 'video' ? STRINGS.timedOutVideo(provider) : STRINGS.timedOutCaptions,
    tone: 'neutral',
    actions:
      mode === 'video'
        ? [
            { label: STRINGS.useCaptionsInstead, onClick: onCaptions },
            { label: STRINGS.retry, onClick: onRetry, secondary: true },
          ]
        : [{ label: STRINGS.retry, onClick: onRetry }],
  }),

  saved: (onOpen: () => void): ToastState => ({
    message: STRINGS.saved,
    tone: 'grounded',
    actions: [{ label: STRINGS.open, onClick: onOpen }],
  }),

  partial: (n: number, onWhy: () => void, onOpen: () => void): ToastState => ({
    message: STRINGS.partial(n),
    tone: 'partial',
    actions: [
      { label: STRINGS.why, onClick: onWhy },
      { label: STRINGS.open, onClick: onOpen, secondary: true },
    ],
  }),

  ungrounded: (onTryVideo: () => void, onDiscard: () => void): ToastState => ({
    message: STRINGS.ungrounded,
    // NOT an error tone. This is the whole point of the state.
    tone: 'ungrounded',
    actions: [
      { label: STRINGS.tryVideo, onClick: onTryVideo },
      { label: STRINGS.discard, onClick: onDiscard, secondary: true },
    ],
  }),

  noTranscript: (onTryVideo: () => void, onDismiss: () => void): ToastState => ({
    message: STRINGS.noTranscript,
    tone: 'neutral',
    actions: [
      { label: STRINGS.tryVideo, onClick: onTryVideo },
      { label: STRINGS.dismiss, onClick: onDismiss, secondary: true },
    ],
  }),

  /** F1b — no video offer. Nothing is wrong with the video. */
  rateLimited: (onRetry: () => void): ToastState => ({
    message: STRINGS.rateLimited,
    tone: 'neutral',
    actions: [{ label: STRINGS.retry, onClick: onRetry }],
  }),

  /** F1c — no video offer. A restricted video will fail there too. */
  restricted: (onDismiss: () => void): ToastState => ({
    message: STRINGS.restricted,
    tone: 'neutral',
    actions: [{ label: STRINGS.dismiss, onClick: onDismiss, secondary: true }],
  }),

  noKey: (onOpenSettings: () => void): ToastState => ({
    message: STRINGS.noKey,
    tone: 'neutral',
    actions: [{ label: STRINGS.openSettings, onClick: onOpenSettings }],
  }),

  disclosureRequired: (provider: string, onOpenSettings: () => void): ToastState => ({
    message: STRINGS.trainingDisclosure(provider),
    tone: 'neutral',
    actions: [{ label: STRINGS.openSettings, onClick: onOpenSettings }],
  }),

  videoUnavailable: (provider: string, onKeepCaptions: () => void): ToastState => ({
    message: STRINGS.videoUnavailable(provider),
    tone: 'neutral',
    actions: [{ label: STRINGS.keepCaptions, onClick: onKeepCaptions }],
  }),

  offline: (): ToastState => ({ message: STRINGS.offline, tone: 'neutral' }),

  unreadablePage: (): ToastState => ({ message: STRINGS.unreadablePage, tone: 'neutral' }),
} as const
