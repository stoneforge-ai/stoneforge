# @stoneforge/quarry

## 1.10.2

### Patch Changes

- fd1ae79: Fix history command help text: correct short flag from `-n` to `-l` for `--limit` option
  - @stoneforge/smithy@1.10.2
  - @stoneforge/core@1.10.2
  - @stoneforge/storage@1.10.2
  - @stoneforge/shared-routes@1.10.2

## 1.10.1

### Patch Changes

- Updated dependencies [08ffa58]
  - @stoneforge/smithy@1.10.1
  - @stoneforge/core@1.10.1
  - @stoneforge/storage@1.10.1
  - @stoneforge/shared-routes@1.10.1

## 1.10.0

### Minor Changes

- c089311: Add optional `baseBranch` configuration field for explicitly setting the merge target branch. Supports config file (`base_branch`), environment variable (`STONEFORGE_BASE_BRANCH`), and CLI override. When unset, existing auto-detection behavior is preserved.

### Patch Changes

- 8a17c01: Fix CLI parser to accept kebab-case flags for camelCase options (e.g., --reply-to, --root-only, --doc-version). Both kebab-case and camelCase forms are now accepted, with kebab-case being the preferred convention.
- 490b026: Fix `sf install skills` failing to find skills in NPM installs by correcting package resolution from `@stoneforge/orchestrator-sdk` to `@stoneforge/smithy` in all four discovery paths.
- Updated dependencies [86032d2]
- Updated dependencies [f7df3bc]
- Updated dependencies [1828e64]
- Updated dependencies [69ab9e2]
- Updated dependencies [490b026]
- Updated dependencies [f4c7855]
  - @stoneforge/smithy@1.10.0
  - @stoneforge/core@1.10.0
  - @stoneforge/shared-routes@1.10.0
  - @stoneforge/storage@1.10.0

## 1.9.0

### Minor Changes

- c97555d: Add `sf docs` CLI command with `init` and `add` subcommands for streamlined documentation infrastructure management

### Patch Changes

- Updated dependencies [b4eca92]
- Updated dependencies [c93577b]
- Updated dependencies [db8ae6c]
  - @stoneforge/smithy@1.9.0
  - @stoneforge/core@1.9.0
  - @stoneforge/storage@1.9.0
  - @stoneforge/shared-routes@1.9.0

## 1.8.0

### Patch Changes

- 0b521cd: Replace inline bulk task update/delete routes with shared createTaskRoutes factory from @stoneforge/shared-routes.
- Updated dependencies [0b521cd]
- Updated dependencies [0b521cd]
  - @stoneforge/shared-routes@1.8.0
  - @stoneforge/smithy@1.8.0
  - @stoneforge/core@1.8.0
  - @stoneforge/storage@1.8.0

## 1.7.0

### Patch Changes

- Updated dependencies [ddab519]
- Updated dependencies [23c7deb]
- Updated dependencies [61a672d]
- Updated dependencies [9b29d2b]
- Updated dependencies [b884a2b]
- Updated dependencies [0de4580]
  - @stoneforge/smithy@1.7.0
  - @stoneforge/core@1.7.0
  - @stoneforge/storage@1.7.0
  - @stoneforge/shared-routes@1.7.0

## 1.6.0

### Patch Changes

- e1d7d77: Add getOrgChart() and sendDirectMessage() methods to the QuarryAPI interface
- Updated dependencies [8a9c57d]
- Updated dependencies [e4d7815]
  - @stoneforge/smithy@1.6.0
  - @stoneforge/core@1.6.0
  - @stoneforge/storage@1.6.0
  - @stoneforge/shared-routes@1.6.0

## 1.5.0

### Patch Changes

- Updated dependencies [ac2db90]
- Updated dependencies [dcd3a8c]
- Updated dependencies [a5a8ff0]
- Updated dependencies [a40b09e]
- Updated dependencies [1ac72cc]
- Updated dependencies [f5eb10f]
- Updated dependencies [87e2883]
- Updated dependencies [6c22879]
- Updated dependencies [9a147df]
- Updated dependencies [4cded6a]
- Updated dependencies [53c79f5]
- Updated dependencies [3a909a2]
  - @stoneforge/smithy@1.5.0
  - @stoneforge/core@1.5.0
  - @stoneforge/storage@1.5.0
  - @stoneforge/shared-routes@1.5.0

## 1.4.1

### Patch Changes

- Updated dependencies [b92e7d8]
  - @stoneforge/smithy@1.4.1
  - @stoneforge/core@1.4.1
  - @stoneforge/storage@1.4.1
  - @stoneforge/shared-routes@1.4.1

## 1.4.0

### Minor Changes

- af799d2: Add DEFAULT_AGENTS_MD template constant for use during `sf init` workspace initialization
- 1ec9f66: Wire AGENTS.md creation and skills installation into sf init command

### Patch Changes

- @stoneforge/smithy@1.4.0
- @stoneforge/core@1.4.0
- @stoneforge/storage@1.4.0
- @stoneforge/shared-routes@1.4.0

## 1.3.0

### Patch Changes

- 1949799: Register missing CLI aliases (add, new, ls, complete) and add undocumented aliases (dep, msg, doc) to help text
- cfb1ee2: Remove dead --no-open flag from serve command schema
- Updated dependencies [9bd5c22]
- Updated dependencies [8e6aa99]
- Updated dependencies [8e6aa99]
- Updated dependencies [0ab3792]
- Updated dependencies [cfb1ee2]
- Updated dependencies [7e0053c]
  - @stoneforge/smithy@1.3.0
  - @stoneforge/storage@1.3.0
  - @stoneforge/shared-routes@1.3.0
  - @stoneforge/core@1.3.0

## 1.2.0

### Minor Changes

- 4fc3f2a: Display computed 'blocked' status in CLI task list and show commands for tasks with unresolved dependencies

### Patch Changes

- bd78abd: Export identity API functions (resolveActor, validateSoftActor, createVerificationMiddleware) and ActorSource type from systems module
- dd47614: Rename 70 bun:test files to .bun.test.ts naming convention so vitest excludes them from collection. Add vitest.config.ts with exclude pattern.
- 2872120: Reduce auto-export polling frequency from 500ms to 5 minutes to decrease unnecessary I/O
- Updated dependencies [c7c3a2e]
- Updated dependencies [acf6ed0]
- Updated dependencies [a468899]
- Updated dependencies [4fc3f2a]
- Updated dependencies [dd47614]
- Updated dependencies [2cec11b]
- Updated dependencies [dd47614]
- Updated dependencies [9b92e7d]
- Updated dependencies [bbd2d1f]
- Updated dependencies [430695f]
- Updated dependencies [c3030f7]
- Updated dependencies [6ad6161]
- Updated dependencies [6a03ab1]
- Updated dependencies [6835442]
- Updated dependencies [ff790e4]
- Updated dependencies [70dd977]
- Updated dependencies [dfa164c]
- Updated dependencies [ab58a62]
- Updated dependencies [af0b8f3]
  - @stoneforge/smithy@1.2.0
  - @stoneforge/core@1.2.0
  - @stoneforge/storage@1.2.0
  - @stoneforge/shared-routes@1.2.0

## 1.1.0

### Minor Changes

- 24ca206: Add `sf plan auto-complete` CLI command that scans all active plans and transitions those with 100% task completion to completed status. Includes `--dry-run` mode and `sweep` alias.

### Patch Changes

- 2af42ec: - Fix `sf init` to import JSONL files from `.stoneforge/sync/` (where auto-export writes) instead of the stale root `.stoneforge/` directory.
  - @stoneforge/smithy@1.1.0
  - @stoneforge/core@1.1.0
  - @stoneforge/storage@1.1.0
  - @stoneforge/shared-routes@1.1.0

## 1.0.3

### Patch Changes

- d088df0: - Fix `sf -V` reporting hardcoded "v0.1.0" instead of actual installed version by reading version from package.json at runtime.
  - Fix `sf init` failing with "Referenced element does not exist" when cloning a repo with stale JSONL files. Dependencies referencing elements not in `elements.jsonl` are now skipped gracefully instead of triggering a fatal foreign key violation.
  - Wire up automatic JSONL export via new `AutoExportService`. When `sync.autoExport` is enabled (default), the server polls for dirty elements and incrementally exports to `.stoneforge/sync/` on each mutation.
- Updated dependencies [f4c196e]
  - @stoneforge/smithy@1.0.3
  - @stoneforge/core@1.0.3
  - @stoneforge/storage@1.0.3
  - @stoneforge/shared-routes@1.0.3

## 1.0.2

### Patch Changes

- Updated dependencies [8d82c91]
  - @stoneforge/smithy@1.0.2
  - @stoneforge/core@1.0.2
  - @stoneforge/storage@1.0.2
  - @stoneforge/shared-routes@1.0.2

## 1.0.1

### Patch Changes

- Updated dependencies [1a52cad]
  - @stoneforge/smithy@1.0.1
  - @stoneforge/core@1.0.1
  - @stoneforge/storage@1.0.1
  - @stoneforge/shared-routes@1.0.1

## 1.0.0

### Minor Changes

- 251485f: Add dispatch-ready task listing CLI command, fix blocked cache cascade for plan-level dependencies, add blocked-plan filter to ready(), update sf init gitignore template and handle cloned repos

### Patch Changes

- Updated dependencies [251485f]
  - @stoneforge/smithy@1.0.0
  - @stoneforge/core@1.0.0
  - @stoneforge/storage@1.0.0
  - @stoneforge/shared-routes@1.0.0
