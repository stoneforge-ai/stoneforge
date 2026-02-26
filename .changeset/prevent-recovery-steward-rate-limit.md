---
"@stoneforge/smithy": patch
---

Prevent recovery steward assignment to rate-limited or multi-assigned tasks. Added session history pattern detection to skip recovery steward spawn when task failures indicate rate limiting. Added multi-assignment guard to prevent stewards from being assigned multiple tasks across poll cycles.
