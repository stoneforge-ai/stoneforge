---
"@stoneforge/smithy": patch
---

Skip resumeCount and stewardRecoveryCount increment during rate limits in orphan recovery, preventing false recovery steward triggers for non-stuck tasks
