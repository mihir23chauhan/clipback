/**
 * C1 — the MAIN-world transcript reader.
 *
 * Skeleton only. It lives in the page's world because acquisition rungs 1 and
 * 2 need the page's session state, NOT because it does DOM work — it renders
 * nothing, and the only DOM it may ever touch is rung 3's transcript panel.
 *
 * MAIN-world scripts have no `chrome.*`, so this bridges to the isolated world
 * by postMessage. The credential never crosses that boundary in either
 * direction: hld T3, and it is structural rather than a rule anyone enforces.
 *
 * be-plan task 1 is the probe this file exists for: is
 * youtubei/v1/get_transcript reachable from here? arch names it as the
 * what-would-change-my-mind condition for the whole acquisition design.
 */

export type Route = 'baseurl' | 'innertube' | 'dom'
export type FailureReason = 'restricted' | 'rate-limited' | 'no-captions' | 'empty'

console.log('[clipback] main-world reader loaded')
