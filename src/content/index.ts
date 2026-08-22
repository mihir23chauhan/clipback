/**
 * C2 — the isolated content script.
 *
 * Skeleton only. What it proves today: the extension injects on a watch page
 * and can read the player. It issues no nonce and renders no toast yet.
 */
import { captureBoundsSeconds } from './capture'

const SEGMENT_SECONDS_DEFAULT = 180

function player(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>('video.html5-main-video, video')
}

export function currentBounds(segmentSeconds = SEGMENT_SECONDS_DEFAULT) {
  const v = player()
  if (!v) return null
  return captureBoundsSeconds(v.currentTime, segmentSeconds)
}

console.log('[clipback] content script injected')
