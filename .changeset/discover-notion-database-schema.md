---
"@stoneforge/quarry": patch
---

Fix Notion adapter to discover database schema instead of hardcoding property names. The title property name is now discovered from the database schema (supporting databases where it's called "Name", "Title", or any custom name). Category and Tags properties are auto-created if missing, with graceful fallback when the integration lacks permission.
