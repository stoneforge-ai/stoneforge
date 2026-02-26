---
"@stoneforge/storage": patch
---

Add migration 11 to update inbox_items CHECK constraint to include 'thread_reply' source_type. Recreates the table since SQLite does not support ALTER CONSTRAINT.
