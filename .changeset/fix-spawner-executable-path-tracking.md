---
"@stoneforge/smithy": patch
---

Fix spawner executable path tracking for rate limit events from fallback executables. Session manager now passes the resolved executable path to the spawner so rate limit events identify the correct executable. Dispatch daemon marks all fallback chain entries as rate-limited when any chain entry hits a plan-level limit.
