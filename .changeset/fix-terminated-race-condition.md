---
"@stoneforge/smithy": patch
---

Fix terminated->terminated race condition in spawner catch blocks

Guard `transitionStatus(session, 'terminated')` calls in `spawnHeadless()`, `spawnInteractive()`, and `spawn()` catch blocks to prevent `Invalid status transition: terminated -> terminated` errors when concurrent async code paths (e.g., `processProviderMessages` finishing before `waitForInit` timeout) race to terminate the same session.
