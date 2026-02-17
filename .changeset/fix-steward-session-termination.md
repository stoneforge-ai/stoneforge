---
"@stoneforge/smithy": minor
---

Fix docs/custom steward sessions not terminating after agent completes

- Detect agent completion signal in spawner: close headless session when a
  non-error `result` message is received, breaking the for-await loop that
  previously kept sessions running indefinitely
- Add idle timeout monitoring for spawned steward sessions (configurable,
  default 2 minutes) with max duration safety net (default 30 minutes)
- Add steward-specific session reaping in dispatch daemon with configurable
  `maxStewardSessionDurationMs` (default 30 minutes)
