import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Add the 'bun' export condition so Vite resolves @stoneforge/*
    // workspace packages to their TypeScript source (./src/index.ts)
    // instead of built output (./dist/index.js). This avoids needing
    // a build step in worktree environments where dist/ doesn't exist.
    conditions: ['bun'],
  },
  ssr: {
    resolve: {
      // Vitest runs in SSR mode, so conditions must also be set here
      // for the SSR resolver to recognize the 'bun' export condition.
      conditions: ['bun'],
    },
  },
  test: {
    // Only run vitest-compatible tests (*.test.ts)
    // Bun-specific tests use the *.bun.test.ts naming convention
    // and are excluded from vitest collection.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.bun.test.ts',
      '**/.stoneforge/.worktrees/**',
    ],
  },
});
