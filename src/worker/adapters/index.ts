/**
 * The registry.
 *
 * Together with the vendor's own file, this is the ONLY thing a fourth provider
 * touches. If a third file has to change, the abstraction leaked and that is a
 * finding about K3 rather than a detail of the new adapter.
 */
import type { ProviderAdapter } from './types'
import { gemini } from './gemini'
import { openai } from './openai'
import { anthropic } from './anthropic'

export const ADAPTERS: readonly ProviderAdapter[] = [gemini, openai, anthropic]

export function adapterById(id: string): ProviderAdapter | undefined {
  return ADAPTERS.find((a) => a.id === id)
}

/** Callers branch on the declared flag, never on a vendor name. */
export function videoCapableAdapters(): readonly ProviderAdapter[] {
  return ADAPTERS.filter((a) => a.supportsVideo)
}

export type { ProviderAdapter } from './types'
