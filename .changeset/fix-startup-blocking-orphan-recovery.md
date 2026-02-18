---
"@stoneforge/smithy": patch
---

Fix startup blocking on stale session resume in dispatch daemon orphan recovery

The dispatch daemon's start() method no longer blocks on recoverOrphanedAssignments() before starting the poll loop. Orphan recovery now runs in the background, and a startupRecoveryInFlight flag prevents runPollCycle from duplicating the work. This ensures tasks are dispatched within the first poll interval after server restart, even if stale session resumes take a long time to timeout.
