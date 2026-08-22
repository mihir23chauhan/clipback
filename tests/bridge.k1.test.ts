import { describe, expect, it } from 'vitest'
import { isK1ReplyFor, isK1Request, replyTo, type K1Request } from '../src/main-world/bridge'

const req: K1Request = { v: 1, nonce: 'nonce-abc', kind: 'acquire', videoId: 'vid1' }

describe('K1 is a public, forgeable channel — hld T2', () => {
  const good = replyTo(req, { ok: true, route: 'innertube', cues: [{ t: 0, d: 5, text: 'hi' }] } as never)

  it('accepts a reply carrying the nonce we issued', () => {
    expect(isK1ReplyFor(good, 'nonce-abc', 'vid1')).toBe(true)
  })

  it('REJECTS a reply with a nonce we did not issue — the forgery case', () => {
    // Without this, a transcript posted by YouTube's own scripts is
    // indistinguishable from one clipback asked for.
    expect(isK1ReplyFor({ ...good, nonce: 'attacker' }, 'nonce-abc', 'vid1')).toBe(false)
  })

  it('REJECTS a reply with no nonce at all', () => {
    const noNonce: Record<string, unknown> = { ...(good as unknown as Record<string, unknown>) }
    delete noNonce['nonce']
    expect(isK1ReplyFor(noNonce, 'nonce-abc', 'vid1')).toBe(false)
  })

  it('REJECTS a replayed reply for a different video', () => {
    expect(isK1ReplyFor(good, 'nonce-abc', 'vid2')).toBe(false)
  })

  it('REJECTS a bare object that merely claims ok:true', () => {
    expect(isK1ReplyFor({ ok: true, cues: [] }, 'nonce-abc', 'vid1')).toBe(false)
  })

  it('REJECTS a wrong protocol version', () => {
    expect(isK1ReplyFor({ ...good, v: 2 }, 'nonce-abc', 'vid1')).toBe(false)
  })

  it('accepts a well-formed failure, carrying one of the four reasons', () => {
    const f = replyTo(req, { ok: false, reason: 'rate-limited' } as never)
    expect(isK1ReplyFor(f, 'nonce-abc', 'vid1')).toBe(true)
  })

  it('REJECTS a success-shaped reply with no cues array', () => {
    expect(isK1ReplyFor({ ...good, cues: 'lots' }, 'nonce-abc', 'vid1')).toBe(false)
  })
})

describe('the credential never crosses K1 — hld T3', () => {
  it('has no field for it in either direction', () => {
    const reply = replyTo(req, { ok: true, route: 'dom', cues: [] } as never)
    const keys = [...Object.keys(req), ...Object.keys(reply)]
    for (const forbidden of ['key', 'apiKey', 'token', 'authorization']) {
      expect(keys).not.toContain(forbidden)
    }
  })
})

describe('isK1Request', () => {
  it('accepts a well-formed request', () => {
    expect(isK1Request(req)).toBe(true)
  })
  it('rejects one with an empty nonce', () => {
    expect(isK1Request({ ...req, nonce: '' })).toBe(false)
  })
  it('rejects arbitrary page chatter', () => {
    expect(isK1Request({ type: 'yt-navigate-finish' })).toBe(false)
    expect(isK1Request(null)).toBe(false)
  })
})

describe('replyTo echoes the nonce verbatim', () => {
  it('does not regenerate or transform it', () => {
    const r = replyTo(req, { ok: false, reason: 'empty' } as never)
    expect(r.nonce).toBe(req.nonce)
    expect(r.videoId).toBe(req.videoId)
  })
})
