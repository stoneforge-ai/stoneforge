---
"@stoneforge/smithy": patch
---

Fix `posix_spawnp failed` error when node-pty spawn-helper lacks execute permissions after NPM install. The fix script now ships with the published package and uses `require.resolve` to locate node-pty regardless of package manager.
