---
"@stoneforge/smithy": patch
---

Fix token capture: record metrics incrementally via upsert on each assistant event, fix accumulation bug that used falsy checks and replacement instead of Math.max, and cache task ID lookups
