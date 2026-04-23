---
"@stoneforge/smithy": minor
---

Add pollWorkflowAutoTransition() to dispatch daemon polling loop. Workflows now automatically transition from pending→running when a task starts, running→completed when all tasks close, and pending|running→failed when a task is tombstoned.
