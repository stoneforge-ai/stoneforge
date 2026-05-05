---
"@stoneforge/smithy": patch
---

fix: strip CLAUDECODE from spawned-claude env to allow nested spawns

When stoneforge runs from inside a Claude Code session (any user invoking `sf` from Claude Code's bash tool, or a director orchestrating workers from a Claude Code session), the spawned claude subprocess inherits `CLAUDECODE=1` from `process.env`. The previous explicit `CLAUDECODE: '1'` in the env spread re-asserted it. Modern claude versions read `CLAUDECODE` and refuse to start with "Claude Code cannot be launched inside another Claude Code session", which the spawner surfaced as the cryptic "Session exited before init".

Strip `CLAUDECODE` from the env passed to both headless (SDK) and interactive (PTY) provider spawns. Stoneforge IS the parent; the spawned claude is a fresh top-level session, not nested.
