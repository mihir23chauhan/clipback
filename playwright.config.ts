import { defineConfig } from '@playwright/test'

// A headless page cannot load an unpacked extension, and there is no other way
// to exercise clipback's three execution contexts for real. So every e2e test
// here drives a PERSISTENT context with --load-extension, launched per test
// file rather than through Playwright's `use.browser`.
export default defineConfig({
  testDir: './e2e',
  // The probes under e2e/probes hit the live YouTube network and are not a gate.
  // They answer a design question on demand; `npm run probe` runs them.
  testIgnore: ['**/probes/**'],
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
})
