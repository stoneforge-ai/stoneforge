---
"@stoneforge/smithy": patch
---

Fix agent pool slot accounting so worker and steward slots are released when sessions leave active execution. Pool reservations now happen before session startup, are released if startup fails, and session restarts wait for prior session-end cleanup so stale callbacks cannot corrupt pool capacity.
