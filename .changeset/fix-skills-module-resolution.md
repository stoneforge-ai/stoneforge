---
"@stoneforge/quarry": patch
---

Fix findSkillsSourceDir to resolve skills via module resolution using createRequire, replacing the broken process.execPath-based lookup that failed for pnpm, yarn, and bun global installs.
