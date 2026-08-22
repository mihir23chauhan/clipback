import { defineConfig } from '@playwright/test'

/**
 * The acquisition probes. NOT a gate.
 *
 * They hit the live YouTube network to answer be-plan task 1 — which
 * acquisition rungs are reachable — and that answer changes with YouTube, not
 * with our code. Running them in CI would make a green build depend on a third
 * party's current behaviour.
 */
export default defineConfig({
  testDir: './e2e/probes',
  timeout: 90_000,
  workers: 1,
  reporter: [['list']],
})
