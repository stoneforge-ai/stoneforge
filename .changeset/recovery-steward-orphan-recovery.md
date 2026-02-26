---
"@stoneforge/smithy": patch
---

Add Phase 3 to orphan recovery for recovery stewards. When a recovery steward's session exits without completing triage, the task is now automatically unassigned and reset for fresh worker dispatch, preventing tasks from becoming permanently stuck.
