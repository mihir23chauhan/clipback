/**
 * Every user-facing string, in one place.
 *
 * v1 is English. They are externalised so translation is not a rewrite — uiux
 * i18n, and that is the whole of the coverage.
 *
 * Three rules hold across all of it, from uiux's copy table:
 *   never the word "AI";
 *   every failure says what to do next AND whether the clip was kept;
 *   modes are named by cost, not by vendor.
 */

const mmss = (s: number): string => {
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export const STRINGS = {
  capturingCaptions: (segmentSeconds: number) => `Capturing last ${mmss(segmentSeconds)}…`,
  capturingVideo: (segmentSeconds: number) =>
    `Capturing last ${mmss(segmentSeconds)} — sending video, up to a minute.`,

  slowCaptions: 'Still working — this is slower than usual.',
  slowVideo: (provider: string) => `Taking longer than usual — ${provider} is busy.`,
  downgradeOffer: 'Still stuck. Use captions instead? (free)',

  timedOutVideo: (provider: string) =>
    `Gave up after 2 minutes — ${provider} is overloaded. Your clip is kept, and this attempt may still be billed.`,
  timedOutCaptions: 'Gave up waiting. Your clip is kept.',

  saved: 'Note saved.',
  partial: (n: number) => `Saved — ${n} claims dropped.`,
  ungrounded: "Couldn't ground this segment. The transcript didn't support any claims.",
  noTranscript: 'No transcript for this video.',
  noKey: 'Add your API key to start.',
  offline: "You're offline — clip not saved.",
  unreadablePage: "clipback can't read this page.",
  keyReentry: "Re-enter your key — clipback never stores it.",

  rateLimited: 'YouTube is rate-limiting us — try again in a moment.',
  restricted: "This video's transcript isn't available to clipback.",
  networkFailed: (provider: string) => `Couldn't reach ${provider}. Your clip is kept.`,
  providerBusy: (provider: string) => `${provider} is busy. Your clip is kept.`,
  somethingWrong: 'Something went wrong. Your clip is kept.',

  /**
   * FR-014. hld assigns this string to fe-plan by name, and fe-plan wrote it.
   * Acknowledged, not merely displayed — declining leaves the extension
   * configured and unable to compose. There is no silent proceed.
   */
  trainingDisclosure: (provider: string) =>
    `${provider}'s free tier may use what you send to improve their models. Your clips and transcripts go to them, not to us — clipback has no server.`,
  trainingAccept: 'I understand — continue',
  trainingDecline: 'Not now',

  /** spec decision 5 — told at the point of choosing, not left to discover. */
  videoUnavailable: (provider: string) =>
    `Video mode needs a provider that can read video. ${provider} can't yet — captions mode works and is free.`,
  switchProvider: 'Switch provider',
  keepCaptions: 'Keep captions',

  // Actions
  tryVideo: 'Try video (~$0.015)',
  discard: 'Discard',
  dismiss: 'Dismiss',
  retry: 'Retry',
  why: 'Why?',
  open: 'Open',
  openSettings: 'Open settings',
  useCaptionsInstead: 'Use captions instead',
  stop: 'Stop',
  stopNote: 'this attempt may still be billed',
  undo: 'Undo',

  firstRunHint: 'Press Alt+C to clip the last 3 minutes. It captures backwards — no need to rewind.',
} as const

/** uiux S2: per-mode, and the single-number version was explicitly rejected. */
export const TIMERS = {
  captions: { slow: 5_000, timeout: 20_000 },
  video: { slow: 60_000, downgrade: 90_000, timeout: 120_000 },
} as const
