import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    coverage: {
      provider: 'v8',
      thresholds: { lines: 85, functions: 85, branches: 80, statements: 85 },
    },
  },
})
