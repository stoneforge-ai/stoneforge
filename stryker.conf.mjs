/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: "pnpm",
  plugins: [
    "@stryker-mutator/vitest-runner",
    "@stryker-mutator/typescript-checker",
  ],
  testRunner: "vitest",
  coverageAnalysis: "perTest",
  checkers: ["typescript"],
  reporters: ["clear-text", "progress", "html"],
  concurrency: 2,
  mutate: [
    "packages/execution/src/ids.ts",
    "packages/execution/src/internal/selection.ts",
    "packages/execution/src/internal/state.ts",
    "packages/execution/src/internal/view.ts",
    "packages/execution/src/provider-models.ts",
  ],
  ignorePatterns: [
    ".claude/**",
    ".stoneforge/**",
    "**/.turbo/**",
    "**/coverage/**",
    "**/dist/**",
    "coverage/**",
    "dist/**",
    "reference/**",
    "test-results/**",
  ],
  thresholds: {
    high: 90,
    low: 80,
    break: 80,
  },
  vitest: {
    configFile: "vitest.mutation.config.ts",
    related: true,
  },
  typescriptChecker: {
    prioritizePerformanceOverAccuracy: false,
  },
}
