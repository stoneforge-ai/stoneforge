---
"@stoneforge/smithy": patch
---

Fix `posix_spawnp failed` for bun users by ensuring node-pty spawn-helper permissions at runtime before pty.spawn(), since bun skips postinstall scripts by default.
