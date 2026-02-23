---
"@stoneforge/quarry": minor
---

Add --fix flag to sf doctor command for automated database repair. When used, it deletes orphaned rows violating foreign key constraints and rebuilds the blocked cache from the dependency graph.
