---
"@stoneforge/quarry": minor
---

Sync sf:status and sf:priority labels to Linear for lossless round-tripping

Linear issues now receive both native fields (priority, workflow state) and sf:* labels
(sf:priority:critical, sf:status:deferred, etc.) so the exact Stoneforge values survive
round-tripping. Previously these labels were filtered out, causing lossy mapping where
multiple Stoneforge statuses collapsed to the same Linear state.
