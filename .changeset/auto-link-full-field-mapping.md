---
"@stoneforge/quarry": patch
---

Fix autoLinkTask to use taskToExternalTask for full field mapping (priority, type, status labels, real description, native priority) instead of simplified inline input. Falls back to simplified input if mapping fails.
