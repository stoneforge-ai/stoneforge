---
'@stoneforge/smithy': patch
---

Fix wake() to invalidate stale rate limit detection by recording a lastWakeAt timestamp, replacing the grace period and recency check approaches
