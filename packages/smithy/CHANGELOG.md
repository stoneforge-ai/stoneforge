# @stoneforge/smithy

## 1.0.3

### Patch Changes

- f4c196e: - Wire up `AutoExportService` in the orchestrator server so JSONL files at `.stoneforge/sync/` stay in sync with the database automatically.
- Updated dependencies [d088df0]
  - @stoneforge/quarry@1.0.3
  - @stoneforge/core@1.0.3
  - @stoneforge/storage@1.0.3
  - @stoneforge/shared-routes@1.0.3

## 1.0.2

### Patch Changes

- 8d82c91: Fix `posix_spawnp failed` for bun users by ensuring node-pty spawn-helper permissions at runtime before pty.spawn(), since bun skips postinstall scripts by default.
  - @stoneforge/quarry@1.0.2
  - @stoneforge/core@1.0.2
  - @stoneforge/storage@1.0.2
  - @stoneforge/shared-routes@1.0.2

## 1.0.1

### Patch Changes

- 1a52cad: Fix `posix_spawnp failed` error when node-pty spawn-helper lacks execute permissions after NPM install. The fix script now ships with the published package and uses `require.resolve` to locate node-pty regardless of package manager.
  - @stoneforge/quarry@1.0.1
  - @stoneforge/core@1.0.1
  - @stoneforge/storage@1.0.1
  - @stoneforge/shared-routes@1.0.1

## 1.0.0

### Minor Changes

- 251485f: Fix plugin executor timeout by using process group kill to ensure child processes are terminated on CI

### Patch Changes

- Updated dependencies [251485f]
  - @stoneforge/quarry@1.0.0
  - @stoneforge/core@1.0.0
  - @stoneforge/storage@1.0.0
  - @stoneforge/shared-routes@1.0.0
