---
"@stoneforge/core": patch
---

Add pending→failed to valid workflow status transitions, enabling workflows to auto-fail when a task is tombstoned while the workflow is still pending.
