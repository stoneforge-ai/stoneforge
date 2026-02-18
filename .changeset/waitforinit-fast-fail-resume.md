---
"@stoneforge/smithy": patch
---

Make waitForInit reject immediately on resume_failed or session exit

waitForInit() now listens for `resume_failed` and `exit` events in addition to the `system/init` event. When a stale session resume fails or the process exits before init, the promise rejects immediately with a descriptive error instead of blocking for the full timeout duration.
