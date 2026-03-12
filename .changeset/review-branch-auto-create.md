---
"@stoneforge/smithy": minor
---

Auto-create review branch when `merge.targetBranch` is set to a non-main branch (e.g. `stoneforge/review`). The merge steward now ensures the target branch exists before merging, creating it from main HEAD if needed.
