---
"@stoneforge/quarry": patch
---

Retry transient Notion API errors (502/503/504) with exponential backoff. Also update sync-engine isRetryableError() to detect 502/504 patterns.
