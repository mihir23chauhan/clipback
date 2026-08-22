/**
 * The one piece of state that outlives a component, and the reason is specific:
 * C2 HOLDS THE NOTE BECAUSE C3 DIES.
 *
 * hld K6 makes delivery a separate round trip so that a delivery failure never
 * discards a composed note (F8). K2's reply hands the note to this context,
 * which lives as long as the page; the service worker does not. So the retry
 * path can run across as many worker deaths as it takes.
 *
 * It also holds the captured bounds. RETRY REPLAYS STORED OFFSETS — it never
 * re-derives from `video.currentTime`, because the video kept playing during a
 * call that may run to 120 seconds, and recomputing would silently capture a
 * different segment than the user asked for.
 */
import type { Note } from '../worker/note'

export interface CapturedSegment {
  videoId: string
  /** integer seconds, converted once in capture.ts */
  start: number
  end: number
  mode: 'captions' | 'video'
}

export class Session {
  private segment: CapturedSegment | null = null
  private note: Note | null = null
  private undoTimer: ReturnType<typeof setTimeout> | null = null

  /** Store the bounds at capture time. Everything downstream replays these. */
  hold(segment: CapturedSegment): void {
    this.segment = segment
  }

  /** The bounds to send. Never recomputed from the player. */
  storedSegment(): CapturedSegment | null {
    return this.segment
  }

  /** Switch mode without recomputing bounds — the escalate-to-video path. */
  withMode(mode: 'captions' | 'video'): CapturedSegment | null {
    if (!this.segment) return null
    this.segment = { ...this.segment, mode }
    return this.segment
  }

  holdNote(note: Note): void {
    this.note = note
  }

  heldNote(): Note | null {
    return this.note
  }

  /**
   * uiux S2 destructive: Discard is the only destroy, and it is UNDO-ABLE for
   * ten seconds rather than confirmed.
   */
  discardWithUndo(afterMs: number, onExpire: () => void): () => void {
    const kept = this.note
    this.note = null
    this.undoTimer = setTimeout(() => {
      this.undoTimer = null
      onExpire()
    }, afterMs)

    return () => {
      if (this.undoTimer) clearTimeout(this.undoTimer)
      this.undoTimer = null
      this.note = kept
    }
  }

  clear(): void {
    if (this.undoTimer) clearTimeout(this.undoTimer)
    this.undoTimer = null
    this.segment = null
    this.note = null
  }
}
