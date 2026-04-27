import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts"],
    exclude: [
      "node_modules/**",
      "packages/*/coverage/**",
      "packages/*/dist/**",
      "reference/**",
    ],
  },
})
