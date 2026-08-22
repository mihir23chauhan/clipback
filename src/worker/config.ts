/**
 * K5 — configuration reads.
 *
 * The split between stores is not a detail. hld K5 puts BOTH credentials in
 * `chrome.storage.session` — the API key and the Notion token — because arch
 * goal 4 forbids writing a credential to disk without qualification, and the
 * Notion integration token is a credential. Moving either to `local` is a
 * one-word diff that silently contradicts a gate-sealed document and makes
 * uiux's promise "clipback never stores it" false.
 *
 * Everything here is re-read on EVERY use. The service worker is killed when
 * idle, so it holds nothing across a wake; a module-level cache here is a bug
 * that only appears after 30 idle seconds, which is to say never in development.
 */

export const DEFAULT_SEGMENT_SECONDS = 180
export const SEGMENT_CHOICES = [60, 180, 300] as const

export interface Settings {
  segmentSeconds: number
  provider: string
  models: string[]
  mode: 'captions' | 'video'
  /** FR-014. Persists across sessions even though the credential does not. */
  disclosureShown: boolean
}

export interface Credentials {
  apiKey?: string
  notionToken?: string
  notionDatabaseId?: string
}

const LOCAL_KEYS = ['segmentSeconds', 'provider', 'models', 'mode', 'disclosureShown'] as const
const SESSION_KEYS = ['apiKey', 'notionToken', 'notionDatabaseId'] as const

/** Non-secret preferences. These persist. */
export async function readSettings(): Promise<Settings> {
  const s = await chrome.storage.local.get([...LOCAL_KEYS])
  const segment = Number(s['segmentSeconds'])
  const models = s['models']
  return {
    segmentSeconds: Number.isInteger(segment) && segment > 0 ? segment : DEFAULT_SEGMENT_SECONDS,
    provider: typeof s['provider'] === 'string' ? s['provider'] : 'gemini',
    models: Array.isArray(models) ? models.filter((m): m is string => typeof m === 'string') : [],
    mode: s['mode'] === 'video' ? 'video' : 'captions',
    disclosureShown: s['disclosureShown'] === true,
  }
}

/**
 * Credentials. SESSION ONLY — they do not survive a browser restart, by design,
 * and the options page says so rather than treating the empty field as an error.
 */
export async function readCredentials(): Promise<Credentials> {
  const s = await chrome.storage.session.get([...SESSION_KEYS])
  const out: Credentials = {}
  for (const k of SESSION_KEYS) {
    const v = s[k]
    if (typeof v === 'string' && v.length > 0) out[k] = v
  }
  return out
}

export async function writeSettings(patch: Partial<Settings>): Promise<void> {
  await chrome.storage.local.set(patch)
}

/**
 * Writing a credential goes to `session`, always. There is deliberately no
 * function in this module that can put one in `local`.
 */
export async function writeCredentials(patch: Credentials): Promise<void> {
  await chrome.storage.session.set(patch)
}

export async function clearCredentials(): Promise<void> {
  await chrome.storage.session.remove([...SESSION_KEYS])
}

/** Which store a key belongs in. Exported so a test can assert the split. */
export function storeFor(key: string): 'local' | 'session' | 'unknown' {
  if ((LOCAL_KEYS as readonly string[]).includes(key)) return 'local'
  if ((SESSION_KEYS as readonly string[]).includes(key)) return 'session'
  return 'unknown'
}
