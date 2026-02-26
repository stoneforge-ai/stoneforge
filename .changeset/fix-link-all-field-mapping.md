---
"@stoneforge/quarry": patch
---

Fix link-all command to include priority and taskType labels on external issues

The `sf external-sync link-all` command now uses the full field mapping layer when creating external issues. Previously, only user tags were passed as labels; now issues correctly include `sf:priority:*` labels based on task priority, `sf:type:*` labels based on taskType, proper open/closed state based on task status, and hydrated description content.
