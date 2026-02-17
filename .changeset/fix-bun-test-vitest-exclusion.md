---
"@stoneforge/smithy": patch
---

Rename 31 bun-specific test files to use .bun.test.ts naming convention and add vitest.config.ts to exclude them from vitest collection. This prevents vitest from reporting false failures when trying to run bun:test imports.
