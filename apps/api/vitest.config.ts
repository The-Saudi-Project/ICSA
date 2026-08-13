import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    // Integration tests boot an in-memory MongoDB; give them room.
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Each file gets its own process so one test's env mutation cannot leak.
    pool: 'forks',
    restoreMocks: true,
  },
})
