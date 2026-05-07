---
"@stoneforge/smithy": patch
---

fix(smithy): `sf task` commands now honor `merge.requireApproval` config

The shared `createTaskAssignmentService` helper used by `sf task complete`,
`sf task merge`, `sf task handoff`, and friends was hardcoded to wire a
`LocalMergeProvider` regardless of workspace config. This meant the
workflow preset `approve` (which sets `merge.requireApproval=true`) was
silently downgraded to a no-op local merge instead of the GitHub PR flow
the long-running orchestrator already uses in `server/services.ts`.

The CLI now mirrors that wiring: when `merge.requireApproval` is true the
CLI uses `GitHubMergeProvider`, otherwise it stays on the existing
`LocalMergeProvider`. When `requireApproval` is true and the `gh` CLI is
not on PATH, the command fails fast with an actionable error instead of
silently degrading to the local provider.
