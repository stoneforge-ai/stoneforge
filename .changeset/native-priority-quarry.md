---
"@stoneforge/quarry": minor
---

Add native priority support to Linear provider: the Linear adapter now converts between Stoneforge priority (1-5) and Linear native priority (0-4) in create/update/pull operations. The sync engine and task-sync-adapter utilities pass through priority in both push and pull paths. GitHub provider is unaffected.
