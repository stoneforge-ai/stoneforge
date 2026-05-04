---
"@stoneforge/smithy": minor
---

Surface a dispatch-stuck warning when ready unassigned tasks have no available workers to take them.

- New `getDispatchHealth()` method on `DispatchDaemon` returning `{ readyUnassignedTasks, availableWorkers, stuck, hasStuckQueue, computedAt }`. A worker is "available" when it is registered, not disabled, and not terminated. At-capacity workers do not count as stuck (the queue is busy, not stuck).
- Per-tick CLI warn (rate-limited to once per 20 ticks, configurable via `DispatchDaemonConfig.stuckWarnTickInterval`): `[dispatch] N task(s) ready, no available workers...`. Re-warns immediately when the queue clears and re-stuckens.
- `GET /api/daemon/status` includes a `health` field with the snapshot.
- New smithy-web `DispatchHealthBanner` shown on the agents and workspaces pages when the queue is stuck. Dismissible per page-load.

Closes #59. The pool-routing observation in #59 is filed separately.
