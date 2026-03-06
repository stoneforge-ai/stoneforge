---
'@stoneforge/smithy': patch
---

Fix wake() to reset resumeCount for tasks stuck during rate limit period. Workers now resume normally instead of being routed to the recovery steward after a manual wake.
