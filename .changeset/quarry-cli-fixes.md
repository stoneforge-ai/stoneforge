---
"@stoneforge/quarry": patch
---

- Fix `sf -V` reporting hardcoded "v0.1.0" instead of actual installed version by reading version from package.json at runtime.
- Fix `sf init` failing with "Referenced element does not exist" when cloning a repo with stale JSONL files. Dependencies referencing elements not in `elements.jsonl` are now skipped gracefully instead of triggering a fatal foreign key violation.
- Wire up automatic JSONL export via new `AutoExportService`. When `sync.autoExport` is enabled (default), the server polls for dirty elements and incrementally exports to `.stoneforge/sync/` on each mutation.
