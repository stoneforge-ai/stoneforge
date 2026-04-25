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
    "packages/core/src/brand.ts",
    "packages/core/src/execution-capabilities.ts",
    "packages/core/src/ids.ts",
    "packages/execution/src/placement.ts",
    "packages/execution/src/task-readiness.ts",
    "packages/workspace/src/repository-connection.ts",
    "packages/workspace/src/workspace-validation.ts",
    "packages/merge-request/src/merge-policy.ts",
    "packages/merge-request/src/merge-request-task-flow.ts",
    "packages/merge-request/src/review-assignments.ts",
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
};
