---
"@stoneforge/smithy": patch
---

Improve rapid-exit detector to catch rate limits from assistant messages. Previously only silent rate limits (no assistant events) were detected. Now rate limit messages shown as assistant output (e.g. "You've hit your limit · resets 11pm") are also caught, with reset time parsed from the message content.
