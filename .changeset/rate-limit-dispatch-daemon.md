---
"@stoneforge/smithy": minor
---

Integrate rate limit detection, fallback selection, and dispatch pause into the dispatch daemon. The daemon now tracks rate-limited executables, resolves fallback alternatives at dispatch time, and pauses worker/steward spawning when all executables are limited while continuing non-dispatch polling. Rate limit status is exposed in the daemon status API.
