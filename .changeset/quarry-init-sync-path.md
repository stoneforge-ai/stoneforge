---
"@stoneforge/quarry": patch
---

- Fix `sf init` to import JSONL files from `.stoneforge/sync/` (where auto-export writes) instead of the stale root `.stoneforge/` directory.
