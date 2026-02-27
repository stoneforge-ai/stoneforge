---
"@stoneforge/quarry": patch
---

Skip closed/tombstone tasks in external sync push and pull. Push skips tasks with closed or tombstone status to avoid wasting API calls on finished work. Pull skips updates to closed/tombstone tasks unless the external item was reopened (state is open). Link metadata is preserved so reopened tasks resume syncing automatically.
