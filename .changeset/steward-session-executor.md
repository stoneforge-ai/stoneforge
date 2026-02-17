---
"@stoneforge/smithy": minor
---

Steward scheduler improvements: spawn agent sessions for docs/health/reminder/ops stewards instead of calling dedicated services directly, auto-register stewards with the scheduler on agent creation/update, register all stewards when the dispatch daemon starts the scheduler, add structured logging throughout the scheduler lifecycle, and fix duplicate timer bug in `scheduleNextRun` where the `finally` block created orphaned timers on overlapping cron ticks.
