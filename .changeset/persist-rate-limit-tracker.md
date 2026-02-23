---
"@stoneforge/smithy": minor
---

Persist rate limit tracker state to SQLite via SettingsService. Rate limit entries now survive server restarts, preventing the dispatch daemon from immediately re-hitting rate-limited executables after a restart.
