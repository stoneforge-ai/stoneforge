---
"@stoneforge/quarry": minor
---

Add conflict detection and resolution module for external sync. Supports configurable strategies (last_write_wins, local_wins, remote_wins, manual) with field-level merge for non-overlapping changes. Includes manual conflict resolution via sync-conflict tag and metadata storage.
