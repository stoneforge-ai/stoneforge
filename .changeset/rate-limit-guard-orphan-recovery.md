---
"@stoneforge/smithy": patch
---

Add rate limit guard to session resume path in orphan recovery. Prevents burning resumeCount when all executables are rate-limited by checking limits inside recoverOrphanedTask() before attempting resume or spawn.
