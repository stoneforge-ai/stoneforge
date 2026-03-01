# @stoneforge/core

## 1.14.0

### Minor Changes

- 7b0894c: Add optional `libraryPath` field to `ExternalDocumentInput` for organizing documents into subdirectories based on library membership
- 89a73d8: Add optional `category` and `tags` fields to `ExternalDocumentInput` type for passing document metadata through the external sync pipeline

## 1.13.0

### Minor Changes

- f056e73: Add external sync type definitions for bidirectional synchronization with external services (GitHub, Linear, Notion, Slack). Includes provider and adapter interfaces, normalized external item types, sync state tracking, conflict strategies, and type guards.
- e787cb8: Add optional `priority` field to `ExternalTaskInput` and `ExternalTask` interfaces, enabling providers with native priority support (e.g., Linear) to pass priority values through create/update operations instead of relying on label-based conventions.

### Patch Changes

- 695b3b8: Fix tsconfig types array to use "bun" instead of "bun-types" for robust type resolution via @types/bun

## 1.12.0

## 1.11.0

## 1.10.2

## 1.10.1

## 1.10.0

### Patch Changes

- 69ab9e2: Fix Reset Task failing from review status by adding `open` as a valid transition target from `review` in STATUS_TRANSITIONS

## 1.9.0

## 1.8.0

## 1.7.0

## 1.6.0

## 1.5.0

## 1.4.1

## 1.4.0

## 1.3.0

## 1.2.0

### Patch Changes

- dd47614: Rename 22 bun:test files to .bun.test.ts naming convention so vitest excludes them from collection. Add vitest.config.ts with exclude pattern.

## 1.1.0

## 1.0.3

## 1.0.2

## 1.0.1

## 1.0.0
