import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only run vitest-compatible tests (*.test.ts)
    // Bun-specific tests use the *.bun.test.ts naming convention
    // and are excluded from vitest collection.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.bun.test.ts',
    ],
  },
});
