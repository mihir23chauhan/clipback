import { vi } from 'vitest'

/** A minimal chrome.storage double that keeps the local/session split intact. */
export function stubChrome(
  local: Record<string, unknown> = {},
  session: Record<string, unknown> = {},
) {
  const store: Record<'local' | 'session', Record<string, unknown>> = {
    local: { ...local },
    session: { ...session },
  }
  const area = (which: 'local' | 'session') => ({
    get: vi.fn(async (keys: string[]) =>
      Object.fromEntries(keys.filter((k) => k in store[which]).map((k) => [k, store[which][k]])),
    ),
    set: vi.fn(async (patch: Record<string, unknown>) => {
      Object.assign(store[which], patch)
    }),
    remove: vi.fn(async (keys: string[]) => {
      for (const k of keys) delete store[which][k]
    }),
  })
  const downloads = { download: vi.fn(async () => 1) }
  vi.stubGlobal('chrome', {
    storage: { local: area('local'), session: area('session') },
    downloads,
  })
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined })
  vi.stubGlobal(
    'Blob',
    class {
      constructor(public parts: unknown[]) {}
    },
  )
  return { store, downloads }
}
