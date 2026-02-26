---
"@stoneforge/quarry": minor
---

Add status label mapping to GitHub field map. Exports GITHUB_STATUS_LABELS constant, adds optional statusLabels field to TaskSyncFieldMapConfig, and updates buildExternalLabels/parseExternalLabels to handle status labels. Updates gitHubStateToStatus() to use sf:status:* labels for granular status inference from GitHub issues.
