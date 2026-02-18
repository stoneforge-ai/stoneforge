---
"@stoneforge/smithy": patch
---

Clear stale sessionId from task metadata on failed resume to prevent infinite retry loops in orphan recovery
