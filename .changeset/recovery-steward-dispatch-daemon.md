---
"@stoneforge/smithy": minor
---

Add improper session exit detection and recovery steward spawning to dispatch daemon. When a worker is resumed 3+ times without a status change, the daemon stops resuming and spawns a recovery steward instead.
