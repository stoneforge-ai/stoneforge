---
"@stoneforge/smithy": patch
---

Fix premature resumeCount increment in orphan recovery. The counter is now only incremented after successful recovery, preventing workers from being incorrectly flagged as stuck when recovery fails.
