---
"@stoneforge/smithy": minor
---

Add minimum duration floor and rapid-exit detection for rate limits. handleRateLimitDetected() now clamps reset times to a 15-minute minimum to prevent premature tracker expiry. Recovered sessions that exit within 10 seconds without output are treated as suspected silent rate limits — resumeCount is rolled back and a 1-hour fallback rate limit is applied.
