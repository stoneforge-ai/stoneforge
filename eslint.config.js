import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

import sonarjs from "eslint-plugin-sonarjs"
import tseslint from "typescript-eslint"

const sourceFiles = ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts"]
const testFiles = ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"]
const tsconfigRootDir = dirname(fileURLToPath(import.meta.url))

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
      "@typescript-eslint": tseslint.plugin,
      sonarjs,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
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
    files: [...sourceFiles, ...testFiles],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir,
      },
    },
    rules: {
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        {
          assertionStyle: "as",
          objectLiteralTypeAssertions: "never",
        },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          fixStyle: "inline-type-imports",
          prefer: "type-imports",
        },
      ],
      "@typescript-eslint/no-base-to-string": "error",
      "@typescript-eslint/no-confusing-void-expression": [
        "error",
        {
          ignoreArrowShorthand: true,
          ignoreVoidOperator: true,
        },
      ],
      "@typescript-eslint/no-duplicate-type-constituents": "error",
      "@typescript-eslint/no-empty-object-type": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-redundant-type-constituents": "error",
      "@typescript-eslint/no-unnecessary-type-arguments": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/no-unnecessary-type-parameters": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-enum-comparison": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/only-throw-error": "error",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        {
          allowBoolean: true,
          allowNever: true,
          allowNullish: false,
          allowNumber: true,
          allowRegExp: false,
        },
      ],
      "@typescript-eslint/strict-boolean-expressions": [
        "error",
        {
          allowNullableBoolean: false,
          allowNullableObject: true,
          allowNullableString: false,
          allowNumber: false,
          allowString: false,
        },
      ],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
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
  }
)
