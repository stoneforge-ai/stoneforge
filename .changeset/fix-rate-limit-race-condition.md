---
"@stoneforge/smithy": patch
---

Fix race condition where rate limit events emitted immediately after session initialization were lost because the onSessionStarted listener was attached after multiple async database operations. The listener is now attached immediately after startSession()/resumeSession() returns.
