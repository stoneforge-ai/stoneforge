---
"@stoneforge/quarry": minor
---

Wire up CLI `sf external-sync pull` and `sf external-sync sync` commands to execute actual sync operations instead of displaying stub messages. Both commands now create a SyncEngine and call pull/sync directly, with support for --provider, --discover, and --dry-run flags.
