import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";

const sourceFiles = ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts"];
const testFiles = ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"];

export default tseslint.config(
  {
    ignores: [
      "apps/*/dist/**",
      ".claude/settings.local.json",
      ".claude/skills/**",
      ".claude/worktrees/**",
      "coverage/**",
      "node_modules/**",
      "packages/*/coverage/**",
      "packages/*/dist/**",
      "reference/**",
    ],
  },
  {
    files: [
      ...sourceFiles,
      "scripts/**/*.mjs",
      ".codex/hooks/**/*.mjs",
      ".claude/hooks/**/*.mjs",
    ],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        sourceType: "module",
      },
    },
    plugins: {
      sonarjs,
    },
    rules: {
      complexity: ["error", { max: 10 }],
      "max-depth": ["error", 3],
      "max-statements": ["error", 40],
      "sonarjs/cognitive-complexity": ["error", 10],
      "sonarjs/no-collapsible-if": "error",
      "sonarjs/no-duplicated-branches": "error",
      "sonarjs/no-identical-functions": "error",
      "sonarjs/no-nested-conditional": "error",
      "sonarjs/no-small-switch": "error",
    },
  },
  {
    files: [
      ...sourceFiles,
      "scripts/**/*.mjs",
      ".codex/hooks/**/*.mjs",
      ".claude/hooks/**/*.mjs",
    ],
    ignores: testFiles,
    rules: {
      "max-lines-per-function": [
        "error",
        {
          max: 80,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      "max-lines": [
        "error",
        {
          max: 300,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
    },
  },
  {
    files: testFiles,
    rules: {
      "max-lines": [
        "error",
        {
          max: 500,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
    },
  },
);
