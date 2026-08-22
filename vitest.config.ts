import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    environmentMatchGlobs: [['tests/ui.*.test.ts', 'jsdom']],
    include: ['tests/**/*.test.ts'],
  },
})
