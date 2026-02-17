# @stoneforge/quarry

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
