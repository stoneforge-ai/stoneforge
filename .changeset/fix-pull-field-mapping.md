---
"@stoneforge/quarry": minor
---

Fix pull path to use provider field map config instead of hardcoded binary status mapping

- `externalItemToUpdates()` now delegates to `externalTaskToTaskUpdates()` using the provider's `TaskSyncFieldMapConfig`
- `createTaskFromExternal()` also uses provider field map config for correct status, priority, taskType, and tag mapping
- Linear adapter injects `sf:status:*` labels based on workflow state type (e.g., started → sf:status:in-progress)
- Linear field map config now includes `statusLabels` and a label-aware `stateToStatus`
- Pull now correctly maps: Linear "started" → in_progress, "triage" → backlog, GitHub sf:status:deferred → deferred
