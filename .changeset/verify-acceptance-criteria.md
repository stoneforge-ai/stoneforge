---
"@stoneforge/smithy": patch
---

Update merge steward prompt to systematically verify task acceptance criteria before approving merges. The steward now reads the task description, cross-references each acceptance criterion against the diff, and blocks merging if any criterion is not met.
