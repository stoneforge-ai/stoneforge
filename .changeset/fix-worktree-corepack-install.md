---
"@stoneforge/smithy": patch
---

Fix worktree dependency install to respect packageManager field in package.json. When the field is present and corepack is available, the install command is wrapped with corepack to ensure the correct package manager version is used. Falls back to direct invocation when corepack is unavailable.
